package com.lifesheet.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static volatile String pendingLaunchAction = null;

    public static String consumePendingLaunchAction() {
        String a = pendingLaunchAction;
        pendingLaunchAction = null;
        return a;
    }

    private void captureIntentAction(Intent intent) {
        if (intent != null) {
            String action = intent.getStringExtra("launch_action");
            if (action != null && !action.isEmpty()) {
                pendingLaunchAction = action;
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthConnectPlugin.class);
        registerPlugin(WidgetBridgePlugin.class);
        captureIntentAction(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        captureIntentAction(intent);
    }
}
