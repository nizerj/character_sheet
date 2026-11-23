package com.lifesheet.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class LifeSheetWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateSingleWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        const val PREFS_NAME = "life_sheet_widget_prefs"

        fun updateAllWidgets(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, LifeSheetWidgetProvider::class.java))
            for (id in ids) {
                updateSingleWidget(context, manager, id)
            }
        }

        private fun updateSingleWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val level = prefs.getInt("level", 1)
            val streak = prefs.getInt("streak", 0)
            val gold = prefs.getInt("gold", 0)
            val remaining = prefs.getInt("remaining", 0)
            val topTask = prefs.getString("topTask", "All clear for today!") ?: "All clear for today!"

            val views = RemoteViews(context.packageName, R.layout.widget_life_sheet)
            views.setTextViewText(R.id.widget_level, "LV.$level")
            views.setTextViewText(R.id.widget_streak, "🔥 ${streak}d · ${gold} G")
            views.setTextViewText(R.id.widget_remaining, if (remaining > 0) "$remaining due" else "All done ✓")
            views.setTextViewText(R.id.widget_top_task, topTask)

            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

            val openIntent = Intent(context, MainActivity::class.java)
            views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 10, openIntent, flags))

            val taskIntent = Intent(context, MainActivity::class.java).apply {
                putExtra("launch_action", "new-task")
            }
            views.setOnClickPendingIntent(R.id.widget_btn_task, PendingIntent.getActivity(context, 11, taskIntent, flags))

            val focusIntent = Intent(context, MainActivity::class.java).apply {
                putExtra("launch_action", "focus")
            }
            views.setOnClickPendingIntent(R.id.widget_btn_focus, PendingIntent.getActivity(context, 12, focusIntent, flags))

            manager.updateAppWidget(widgetId, views)
        }
    }
}
