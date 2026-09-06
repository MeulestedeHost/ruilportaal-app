package be.meulestede.ruilportaal;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * RuilDichtbij (Android) — twee toestellen naast elkaar wisselen hun zoek- en
 * dubbellijst uit, zonder internet.
 *
 * WAAROM NEARBY CONNECTIONS EN NIET "GEWOON BLUETOOTH"
 * Nearby Connections is de API van Google die zelf kiest waarover het gaat:
 * bluetooth, BLE of wifi-direct, afhankelijk van wat op dat moment werkt. Zelf
 * een BLE-GATT-dienst schrijven zou hetzelfde doen, maar dan met de trage
 * medium en met alle randgevallen (MTU, opsplitsen van berichten) op onze
 * schouders. Op iOS doet MultipeerConnectivity precies hetzelfde werk; die
 * twee samen zijn de reden dat deze plugin op beide platformen even klein is.
 *
 * DEZE KLASSE IS EXPRES DOM
 * Ze zoekt, verbindt en geeft één tekenreeks door. Wat er in die tekenreeks
 * staat en wat het betekent, weet alleen de JavaScript-kant (ruil-dichtbij.js).
 * Zo blijft de code die hier staat — en die niet op een Windows-machine
 * gecompileerd of getest kan worden — zo klein mogelijk.
 */
@CapacitorPlugin(
    name = "RuilDichtbij",
    permissions = {
        @Permission(
            alias = RuilDichtbijPlugin.RECHT_BLUETOOTH,
            strings = {
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            }
        ),
        @Permission(
            alias = RuilDichtbijPlugin.RECHT_WIFI,
            strings = { Manifest.permission.NEARBY_WIFI_DEVICES }
        ),
        @Permission(
            alias = RuilDichtbijPlugin.RECHT_LOCATIE,
            strings = { Manifest.permission.ACCESS_FINE_LOCATION }
        )
    }
)
public class RuilDichtbijPlugin extends Plugin {

    static final String RECHT_BLUETOOTH = "bluetooth";
    static final String RECHT_WIFI = "wifi";
    static final String RECHT_LOCATIE = "locatie";

    /** Moet op beide toestellen gelijk zijn, anders vinden ze elkaar niet. */
    private static final String DIENST_ID = "be.meulestede.ruilportaal";

    /**
     * P2P_CLUSTER: iedereen mag met iedereen verbinden. Op een schoolplein
     * staan er misschien drie kinderen samen; met POINT_TO_POINT zou de derde
     * buitengesloten worden.
     */
    private static final Strategy STRATEGIE = Strategy.P2P_CLUSTER;

    private ConnectionsClient client;
    private String eigenNaam = "Onbekend";
    private String eigenPakket = "";
    private boolean actief = false;

    /** endpointId -> naam van het andere toestel. */
    private final Map<String, String> peers = new HashMap<>();

    // ---------------------------------------------------------------------
    // JavaScript-kant
    // ---------------------------------------------------------------------

    @PluginMethod
    public void start(PluginCall call) {
        String naam = call.getString("naam");
        String pakket = call.getString("pakket");
        if (naam == null || pakket == null) {
            call.reject("naam en pakket zijn verplicht");
            return;
        }
        eigenNaam = naam;
        eigenPakket = pakket;

        String[] nodig = benodigdeRechten();
        if (nodig.length == 0) {
            beginZoeken(call);
        } else {
            requestPermissionForAliases(nodig, call, "naRechten");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopAlles();
        call.resolve();
    }

    @PermissionCallback
    private void naRechten(PluginCall call) {
        for (String alias : benodigdeRechten()) {
            if (getPermissionState(alias) != PermissionState.GRANTED) {
                call.reject(
                    "Zonder toestemming voor bluetooth en toestellen in de buurt kan de app "
                        + "niemand vinden. Je kan dit aanzetten bij de app-instellingen van je telefoon."
                );
                return;
            }
        }
        beginZoeken(call);
    }

    /**
     * Welke rechten Android op déze versie echt vraagt.
     *
     * Android heeft de regels drie keer gewijzigd: tot versie 11 hoorde
     * "toestellen zoeken" bij locatie, versie 12 gaf bluetooth eigen rechten,
     * en versie 13 deed hetzelfde voor wifi. Alles tegelijk vragen zou op een
     * ouder toestel om een recht vragen dat daar niet bestaat.
     */
    private String[] benodigdeRechten() {
        List<String> nodig = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            nodig.add(RECHT_BLUETOOTH);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            nodig.add(RECHT_WIFI);
        } else {
            nodig.add(RECHT_LOCATIE);
        }

        List<String> ontbreekt = new ArrayList<>();
        for (String alias : nodig) {
            if (getPermissionState(alias) != PermissionState.GRANTED) ontbreekt.add(alias);
        }
        return ontbreekt.toArray(new String[0]);
    }

    // ---------------------------------------------------------------------
    // Nearby Connections
    // ---------------------------------------------------------------------

    private void beginZoeken(PluginCall call) {
        client = Nearby.getConnectionsClient(getContext());
        actief = true;

        client
            .startAdvertising(
                eigenNaam,
                DIENST_ID,
                verbindingsCallback,
                new AdvertisingOptions.Builder().setStrategy(STRATEGIE).build()
            )
            .addOnFailureListener(fout -> meldStatus("fout", "Zichtbaar worden mislukt: " + fout.getMessage()));

        client
            .startDiscovery(
                DIENST_ID,
                ontdekkingsCallback,
                new DiscoveryOptions.Builder().setStrategy(STRATEGIE).build()
            )
            .addOnFailureListener(fout -> meldStatus("fout", "Zoeken mislukt: " + fout.getMessage()));

        call.resolve();
    }

    private final EndpointDiscoveryCallback ontdekkingsCallback = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(String endpointId, DiscoveredEndpointInfo info) {
            if (!DIENST_ID.equals(info.getServiceId())) return;
            client
                .requestConnection(eigenNaam, endpointId, verbindingsCallback)
                .addOnFailureListener(fout -> meldStatus("info", "Verbinden mislukt, opnieuw proberen…"));
        }

        @Override
        public void onEndpointLost(String endpointId) {
            peers.remove(endpointId);
        }
    };

    private final ConnectionLifecycleCallback verbindingsCallback = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(String endpointId, ConnectionInfo info) {
            // We aanvaarden zonder de cijfercode te laten vergelijken. Dat is een
            // bewuste afweging: de gebruikers zijn kinderen die naast elkaar
            // staan, en wat er over de lijn gaat is een voornaam met een reeks
            // stickercodes. Nearby versleutelt de verbinding zelf; wat we
            // opgeven is de zekerheid dat de tegenpartij is wie hij zegt.
            peers.put(endpointId, info.getEndpointName());
            client.acceptConnection(endpointId, payloadCallback);
        }

        @Override
        public void onConnectionResult(String endpointId, ConnectionResolution resolutie) {
            if (resolutie.getStatus().getStatusCode() != ConnectionsStatusCodes.STATUS_OK) {
                peers.remove(endpointId);
                return;
            }
            String naam = peers.getOrDefault(endpointId, "Onbekend");
            JSObject data = new JSObject();
            data.put("id", endpointId);
            data.put("naam", naam);
            notifyListeners("peerGevonden", data);

            client.sendPayload(endpointId, Payload.fromBytes(eigenPakket.getBytes(StandardCharsets.UTF_8)));
        }

        @Override
        public void onDisconnected(String endpointId) {
            peers.remove(endpointId);
        }
    };

    private final PayloadCallback payloadCallback = new PayloadCallback() {
        @Override
        public void onPayloadReceived(String endpointId, Payload payload) {
            byte[] bytes = payload.asBytes();
            if (bytes == null) return;
            JSObject data = new JSObject();
            data.put("id", endpointId);
            data.put("naam", peers.getOrDefault(endpointId, "Onbekend"));
            data.put("pakket", new String(bytes, StandardCharsets.UTF_8));
            notifyListeners("peerData", data);
        }

        @Override
        public void onPayloadTransferUpdate(String endpointId, PayloadTransferUpdate update) {
            // Een lijst past in één bytes-payload (Nearby staat 32 kB toe en
            // ruil-dichtbij.js bewaakt die grens), dus er valt geen voortgang
            // te tonen die de gebruiker iets zou zeggen.
        }
    };

    // ---------------------------------------------------------------------
    // Opruimen
    // ---------------------------------------------------------------------

    private void meldStatus(String staat, String boodschap) {
        JSObject data = new JSObject();
        data.put("staat", staat);
        data.put("boodschap", boodschap);
        notifyListeners("status", data);
    }

    private void stopAlles() {
        if (client != null && actief) {
            client.stopDiscovery();
            client.stopAdvertising();
            client.stopAllEndpoints();
        }
        peers.clear();
        actief = false;
    }

    /**
     * Zoeken en zichtbaar zijn kosten batterij en houden de radio's wakker.
     * Zodra de app naar de achtergrond gaat heeft doorgaan geen zin: de
     * gebruiker staat dan niet meer met zijn telefoon naast een ander kind.
     */
    @Override
    protected void handleOnPause() {
        stopAlles();
    }

    @Override
    protected void handleOnDestroy() {
        stopAlles();
    }
}
