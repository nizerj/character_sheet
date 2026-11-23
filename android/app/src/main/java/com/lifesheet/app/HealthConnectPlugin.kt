package com.lifesheet.app

import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.AggregateRequest
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
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pendingPermCall: PluginCall? = null
    private lateinit var permissionLauncher: ActivityResultLauncher<Set<String>>

    companion object {
        private const val SAMSUNG_HEALTH_PKG = "com.sec.android.app.shealth"
        private const val HEVY_PKG = "com.hevy"
    }

    private val requiredPermissions = setOf(
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(BodyFatRecord::class),
        HealthPermission.getReadPermission(LeanBodyMassRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class)
    )

    override fun load() {
        super.load()
        val contract = PermissionController.createRequestPermissionResultContract()
        permissionLauncher = activity.registerForActivityResult(contract) { granted ->
            val call = pendingPermCall
            pendingPermCall = null
            if (call != null) {
                val res = JSObject()
                res.put("granted", granted.isNotEmpty())
                res.put("allGranted", granted.containsAll(requiredPermissions))
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
                    res.put("allGranted", true)
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

    private fun classifyExercise(type: Int): Pair<String, String> {
        return when (type) {
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "running" to "Running"
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "running" to "Treadmill Run"
            ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
            ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "cardio" to "Cycling"
            ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER,
            ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL -> "cardio" to "Swimming"
            ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "cardio" to "Walking"
            ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "cardio" to "Hiking"
            ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL,
            ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE,
            ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING,
            ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "cardio" to "Cardio"
            ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
            ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING,
            ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "strength" to "Strength Training"
            else -> "workout" to "Workout"
        }
    }

    private fun friendlySourceName(pkg: String): String {
        return when {
            pkg == SAMSUNG_HEALTH_PKG -> "Samsung Health"
            pkg == HEVY_PKG || pkg.contains("hevy", ignoreCase = true) -> "Hevy"
            pkg.contains("google.android.apps.fitness") -> "Google Fit"
            pkg.contains("strava") -> "Strava"
            else -> "Health Connect"
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
                val startToday = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant()
                val samsungOrigin = setOf(DataOrigin(SAMSUNG_HEALTH_PKG))

                val result = JSObject()

                // 1. Weight (from bioimpedance scale)
                try {
                    val weightResp = client.readRecords(
                        ReadRecordsRequest(WeightRecord::class, timeRangeFilter = TimeRangeFilter.between(startBody, now))
                    )
                    val latestWeight = weightResp.records.maxByOrNull { it.time }
                    if (latestWeight != null) {
                        result.put("latestWeightKg", latestWeight.weight.inKilograms)
                    }
                } catch (_: Exception) {}

                // 2. Body Fat % (from bioimpedance scale)
                try {
                    val bfResp = client.readRecords(
                        ReadRecordsRequest(BodyFatRecord::class, timeRangeFilter = TimeRangeFilter.between(startBody, now))
                    )
                    val latestBf = bfResp.records.maxByOrNull { it.time }
                    if (latestBf != null) {
                        result.put("latestBodyFatPct", latestBf.percentage.value)
                    }
                } catch (_: Exception) {}

                // 3. Lean Body Mass (from bioimpedance scale)
                try {
                    val leanResp = client.readRecords(
                        ReadRecordsRequest(LeanBodyMassRecord::class, timeRangeFilter = TimeRangeFilter.between(startBody, now))
                    )
                    val latestLean = leanResp.records.maxByOrNull { it.time }
                    if (latestLean != null) {
                        result.put("latestLeanMassKg", latestLean.mass.inKilograms)
                    }
                } catch (_: Exception) {}

                // 4. Exercise Sessions (Hevy + Samsung Health Cardio/Running + exact session distance)
                val workoutsArr = JSArray()
                try {
                    val exResp = client.readRecords(
                        ReadRecordsRequest(ExerciseSessionRecord::class, timeRangeFilter = TimeRangeFilter.between(startWorkouts, now))
                    )
                    for (session in exResp.records) {
                        val mins = Duration.between(session.startTime, session.endTime).toMinutes()
                        val pkg = session.metadata.dataOrigin.packageName
                        val (category, defaultName) = classifyExercise(session.exerciseType)
                        val sourceName = friendlySourceName(pkg)

                        // Fetch deduplicated distance for cardio/running sessions from the same data origin
                        var distanceKm = 0.0
                        if (category == "running" || category == "cardio") {
                            try {
                                val distAgg = client.aggregate(
                                    AggregateRequest(
                                        metrics = setOf(DistanceRecord.DISTANCE_TOTAL),
                                        timeRangeFilter = TimeRangeFilter.between(session.startTime, session.endTime),
                                        dataOriginFilter = setOf(session.metadata.dataOrigin)
                                    )
                                )
                                val meters = distAgg[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0
                                if (meters > 50) {
                                    distanceKm = Math.round((meters / 1000.0) * 100.0) / 100.0
                                }
                            } catch (_: Exception) {}
                        }

                        val obj = JSObject()
                        obj.put("id", session.metadata.id)
                        obj.put("title", session.title?.takeIf { it.isNotBlank() } ?: defaultName)
                        obj.put("category", category)
                        obj.put("sourceApp", sourceName)
                        obj.put("sourcePackage", pkg)
                        obj.put("startTime", session.startTime.toString())
                        obj.put("endTime", session.endTime.toString())
                        obj.put("durationMinutes", mins)
                        if (distanceKm > 0) obj.put("distanceKm", distanceKm)
                        workoutsArr.put(obj)
                    }
                } catch (_: Exception) {}
                result.put("workouts", workoutsArr)

                // 5. Sleep (last night / sessions ending today)
                try {
                    val sleepStartWindow = now.minus(24L, ChronoUnit.HOURS)
                    val sleepResp = client.readRecords(
                        ReadRecordsRequest(SleepSessionRecord::class, timeRangeFilter = TimeRangeFilter.between(sleepStartWindow, now))
                    )
                    val totalSleepMins = sleepResp.records
                        .filter { !it.endTime.isBefore(startToday) }
                        .sumOf { Duration.between(it.startTime, it.endTime).toMinutes() }
                    if (totalSleepMins > 0) {
                        result.put("lastSleepHours", Math.round((totalSleepMins / 60.0) * 10.0) / 10.0)
                    }
                } catch (_: Exception) {}

                // 6. Steps today — ZERO DOUBLE-COUNTING:
                // Prefer Samsung Health exclusively when it provides step data; otherwise use Health Connect's deduplicated aggregate!
                try {
                    val samsungStepsAgg = client.aggregate(
                        AggregateRequest(
                            metrics = setOf(StepsRecord.COUNT_TOTAL),
                            timeRangeFilter = TimeRangeFilter.between(startToday, now),
                            dataOriginFilter = samsungOrigin
                        )
                    )
                    val samsungSteps = samsungStepsAgg[StepsRecord.COUNT_TOTAL] ?: 0L
                    if (samsungSteps > 0L) {
                        result.put("todaySteps", samsungSteps)
                        result.put("stepsSource", "Samsung Health")
                    } else {
                        val allStepsAgg = client.aggregate(
                            AggregateRequest(
                                metrics = setOf(StepsRecord.COUNT_TOTAL),
                                timeRangeFilter = TimeRangeFilter.between(startToday, now)
                            )
                        )
                        val dedupSteps = allStepsAgg[StepsRecord.COUNT_TOTAL] ?: 0L
                        if (dedupSteps > 0L) {
                            result.put("todaySteps", dedupSteps)
                            result.put("stepsSource", "Health Connect")
                        }
                    }
                } catch (_: Exception) {}

                // 7. Today's Cardio / Walking Distance (Samsung Health prioritized, deduplicated)
                try {
                    val samsungDistAgg = client.aggregate(
                        AggregateRequest(
                            metrics = setOf(DistanceRecord.DISTANCE_TOTAL),
                            timeRangeFilter = TimeRangeFilter.between(startToday, now),
                            dataOriginFilter = samsungOrigin
                        )
                    )
                    val samsungMeters = samsungDistAgg[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0
                    val meters = if (samsungMeters > 50) {
                        samsungMeters
                    } else {
                        val allDistAgg = client.aggregate(
                            AggregateRequest(
                                metrics = setOf(DistanceRecord.DISTANCE_TOTAL),
                                timeRangeFilter = TimeRangeFilter.between(startToday, now)
                            )
                        )
                        allDistAgg[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0
                    }
                    if (meters > 50) {
                        result.put("todayDistanceKm", Math.round((meters / 1000.0) * 100.0) / 100.0)
                    }
                } catch (_: Exception) {}

                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Health Connect sync failed: ${e.message}")
            }
        }
    }
}
