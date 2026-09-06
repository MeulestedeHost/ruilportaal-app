package be.meulestede.ruilportaal;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins uit npm-pakketten vindt Capacitor zelf; een plugin die in deze
        // app-module zelf staat moet hier worden aangemeld. Dat moet vóór
        // super.onCreate(): daarin wordt de brug naar de WebView opgezet, en wat
        // daarna nog wordt aangemeld ziet die brug niet meer.
        registerPlugin(RuilDichtbijPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
