package com.lifesheet.app

import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit

@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pendingPermCall: PluginCall? = null
    private lateinit var permissionLauncher: ActivityResultLauncher<Set<String>>

    private val requiredPermissions = setOf(
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(BodyFatRecord::class),
        HealthPermission.getReadPermission(LeanBodyMassRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class)
    )

    override fun load() {
        super.load()
        val contract = PermissionController.createRequestPermissionResultContract()
        permissionLauncher = activity.registerForActivityResult(contract) { granted ->
            val call = pendingPermCall
            pendingPermCall = null
            if (call != null) {
                val res = JSObject()
                res.put("granted", granted.containsAll(requiredPermissions))
                res.put("grantedCount", granted.size)
                call.resolve(res)
            }
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val status = HealthConnectClient.getSdkStatus(context)
        val res = JSObject()
        res.put("available", status == HealthConnectClient.SDK_AVAILABLE)
        res.put(
            "reason",
            when (status) {
                HealthConnectClient.SDK_AVAILABLE -> "Health Connect available"
                HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "Please install or update Health Connect from Play Store"
                else -> "Health Connect is not supported on this device"
            }
        )
        call.resolve(res)
    }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
            call.reject("Health Connect is not available on this device.")
            return
        }
        val client = HealthConnectClient.getOrCreate(context)
        scope.launch {
            try {
                val alreadyGranted = client.permissionController.getGrantedPermissions()
                if (alreadyGranted.containsAll(requiredPermissions)) {
                    val res = JSObject()
                    res.put("granted", true)
                    res.put("grantedCount", alreadyGranted.size)
                    call.resolve(res)
                } else {
                    pendingPermCall = call
                    activity.runOnUiThread {
                        permissionLauncher.launch(requiredPermissions)
                    }
                }
            } catch (e: Exception) {
                call.reject("Permission check failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun syncData(call: PluginCall) {
        if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
            call.reject("Health Connect is not available on this device.")
            return
        }
        val daysBack = call.getInt("daysBack", 7) ?: 7
        val client = HealthConnectClient.getOrCreate(context)

        scope.launch {
            try {
                val now = Instant.now()
                val startWorkouts = now.minus(daysBack.toLong(), ChronoUnit.DAYS)
                val startBody = now.minus(30L, ChronoUnit.DAYS)

                // 1. Latest Weight from bioimpedance scale
                val weightResp = client.readRecords(
                    ReadRecordsRequest(
                        WeightRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(startBody, now)
                    )
                )
                val latestWeight = weightResp.records.maxByOrNull { it.time }

                // 2. Latest Body Fat % & Lean Body Mass from bioimpedance scale
                val bfResp = client.readRecords(
                    ReadRecordsRequest(
                        BodyFatRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(startBody, now)
                    )
                )
                val latestBf = bfResp.records.maxByOrNull { it.time }

                val leanResp = client.readRecords(
                    ReadRecordsRequest(
                        LeanBodyMassRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(startBody, now)
                    )
                )
                val latestLean = leanResp.records.maxByOrNull { it.time }

                // 3. Exercise Sessions (Hevy workouts, runs, etc.)
                val exResp = client.readRecords(
                    ReadRecordsRequest(
                        ExerciseSessionRecord::class,
                        timeRangeFilter = TimeRangeFilter.between(startWorkouts, now)
                    )
                )

                val workoutsArr = JSArray()
                for (session in exResp.records) {
                    val mins = Duration.between(session.startTime, session.endTime).toMinutes()
                    val obj = JSObject()
                    obj.put("id", session.metadata.id)
                    obj.put("title", session.title ?: "Workout")
                    obj.put("startTime", session.startTime.toString())
                    obj.put("endTime", session.endTime.toString())
                    obj.put("durationMinutes", mins)
                    workoutsArr.put(obj)
                }

                val result = JSObject()
                if (latestWeight != null) {
                    result.put("latestWeightKg", latestWeight.weight.inKilograms)
                }
                if (latestBf != null) {
                    result.put("latestBodyFatPct", latestBf.percentage.value)
                }
                if (latestLean != null) {
                    result.put("latestLeanMassKg", latestLean.mass.inKilograms)
                }
                result.put("workouts", workoutsArr)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Health Connect sync failed: ${e.message}")
            }
        }
    }
}
