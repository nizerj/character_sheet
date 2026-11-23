package com.lifesheet.app

import android.content.Context
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {

    @PluginMethod
    fun updateWidget(call: PluginCall) {
        val prefs = context.getSharedPreferences(LifeSheetWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putInt("level", call.getInt("level", 1) ?: 1)
            .putInt("streak", call.getInt("streak", 0) ?: 0)
            .putInt("gold", call.getInt("gold", 0) ?: 0)
            .putInt("remaining", call.getInt("remaining", 0) ?: 0)
            .putString("topTask", call.getString("topTask", "All clear for today!"))
            .apply()
        LifeSheetWidgetProvider.updateAllWidgets(context)
        call.resolve()
    }

    @PluginMethod
    fun consumeLaunchAction(call: PluginCall) {
        val res = JSObject()
        val action = MainActivity.consumePendingLaunchAction()
        res.put("action", action ?: "")
        call.resolve(res)
    }
}
