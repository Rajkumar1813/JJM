package com.jjm.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (Intent.ACTION_BOOT_COMPLETED == action ||
            "android.intent.action.QUICKBOOT_POWERON" == action ||
            "com.htc.intent.action.QUICKBOOT_POWERON" == action) {
            
            try {
                // Check if kioskLock is true in FlutterSharedPreferences
                val prefs = context.getSharedPreferences("FlutterSharedPreferences", Context.MODE_PRIVATE)
                val configStr = prefs.getString("flutter.cached_display_config", null)
                var kioskLock = false
                if (configStr != null) {
                    try {
                        val json = org.json.JSONObject(configStr)
                        val settings = json.optJSONObject("settings")
                        if (settings != null) {
                            kioskLock = settings.optBoolean("kioskLock", false)
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                if (kioskLock) {
                    val launchIntent = Intent(context, MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    }
                    context.startActivity(launchIntent)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
