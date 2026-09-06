import Foundation
import Capacitor
import MultipeerConnectivity

/// RuilDichtbij (iOS) — twee toestellen naast elkaar wisselen hun zoek- en
/// dubbellijst uit, zonder internet.
///
/// MultipeerConnectivity is dezelfde techniek die onder AirDrop zit: het kiest
/// zelf tussen bluetooth en peer-to-peer-wifi en versleutelt de verbinding.
/// AirDrop zelf is niet bruikbaar voor dit doel — Apple biedt daar geen API
/// voor waarmee een app eigen gestructureerde data naar een specifieke app op
/// het andere toestel kan sturen; via het deelvenster krijg je een bestand dat
/// de gebruiker handmatig moet openen. MultipeerConnectivity is de ondersteunde
/// weg voor wat we hier willen.
///
/// Net als de Android-tegenhanger is deze klasse met opzet dom: ze zoekt,
/// verbindt en geeft één tekenreeks door. De betekenis van die tekenreeks zit
/// volledig in ruil-dichtbij.js.
@objc(RuilDichtbijPlugin)
public class RuilDichtbijPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "RuilDichtbijPlugin"
    public let jsName = "RuilDichtbij"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    /// Moet gelijk zijn op beide toestellen, mag hoogstens 15 tekens lang zijn
    /// en enkel kleine letters, cijfers en koppeltekens bevatten (regel van
    /// Bonjour). Deze naam staat ook in NSBonjourServices in Info.plist — als
    /// die twee uit elkaar lopen vindt de app niemand, zonder foutmelding.
    private static let dienst = "ruilportaal"

    private var eigenPeer: MCPeerID?
    private var sessie: MCSession?
    private var adverteerder: MCNearbyServiceAdvertiser?
    private var zoeker: MCNearbyServiceBrowser?
    private var eigenPakket = ""

    // MARK: - JavaScript-kant

    @objc func start(_ call: CAPPluginCall) {
        guard let naam = call.getString("naam"), let pakket = call.getString("pakket") else {
            call.reject("naam en pakket zijn verplicht")
            return
        }
        eigenPakket = pakket

        stopAlles()

        // MCPeerID begrenst de weergavenaam op 63 bytes; een te lange naam laat
        // de initializer crashen in plaats van een fout te geven.
        let kortenaam = String(naam.prefix(40))
        let peer = MCPeerID(displayName: kortenaam)
        eigenPeer = peer

        let sessie = MCSession(peer: peer, securityIdentity: nil, encryptionPreference: .required)
        sessie.delegate = self
        self.sessie = sessie

        let adverteerder = MCNearbyServiceAdvertiser(
            peer: peer,
            discoveryInfo: nil,
            serviceType: Self.dienst
        )
        adverteerder.delegate = self
        adverteerder.startAdvertisingPeer()
        self.adverteerder = adverteerder

        let zoeker = MCNearbyServiceBrowser(peer: peer, serviceType: Self.dienst)
        zoeker.delegate = self
        zoeker.startBrowsingForPeers()
        self.zoeker = zoeker

        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        stopAlles()
        call.resolve()
    }

    private func stopAlles() {
        adverteerder?.stopAdvertisingPeer()
        adverteerder = nil
        zoeker?.stopBrowsingForPeers()
        zoeker = nil
        sessie?.disconnect()
        sessie = nil
    }

    /// Zoeken en zichtbaar zijn houden de radio's wakker. Zodra de app naar de
    /// achtergrond gaat staat de gebruiker niet meer naast een ander kind.
    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(naarAchtergrond),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
    }

    @objc private func naarAchtergrond() {
        stopAlles()
    }

    private func meldStatus(_ staat: String, _ boodschap: String) {
        notifyListeners("status", data: ["staat": staat, "boodschap": boodschap])
    }
}

// MARK: - Gevonden worden

extension RuilDichtbijPlugin: MCNearbyServiceAdvertiserDelegate {

    public func advertiser(
        _ advertiser: MCNearbyServiceAdvertiser,
        didReceiveInvitationFromPeer peerID: MCPeerID,
        withContext context: Data?,
        invitationHandler: @escaping (Bool, MCSession?) -> Void
    ) {
        // We aanvaarden elke uitnodiging. Bewuste afweging, dezelfde als op
        // Android: de gebruikers zijn kinderen die naast elkaar staan en wat er
        // over de lijn gaat is een voornaam met stickercodes. De verbinding is
        // versleuteld; wat we opgeven is de zekerheid over wie er aanklopt.
        invitationHandler(true, sessie)
    }

    public func advertiser(
        _ advertiser: MCNearbyServiceAdvertiser,
        didNotStartAdvertisingPeer error: Error
    ) {
        meldStatus("fout", "Zichtbaar worden mislukt: \(error.localizedDescription)")
    }
}

// MARK: - Zelf zoeken

extension RuilDichtbijPlugin: MCNearbyServiceBrowserDelegate {

    public func browser(
        _ browser: MCNearbyServiceBrowser,
        foundPeer peerID: MCPeerID,
        withDiscoveryInfo info: [String: String]?
    ) {
        guard let sessie = sessie else { return }
        guard !sessie.connectedPeers.contains(peerID) else { return }
        browser.invitePeer(peerID, to: sessie, withContext: nil, timeout: 20)
    }

    public func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        // Niets te doen: als de verbinding wegvalt meldt de sessie dat zelf.
    }

    public func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        meldStatus("fout", "Zoeken mislukt: \(error.localizedDescription)")
    }
}

// MARK: - Verbinding en gegevens

extension RuilDichtbijPlugin: MCSessionDelegate {

    public func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        switch state {
        case .connected:
            notifyListeners("peerGevonden", data: ["id": peerID.displayName, "naam": peerID.displayName])
            if let data = eigenPakket.data(using: .utf8) {
                do {
                    try session.send(data, toPeers: [peerID], with: .reliable)
                } catch {
                    meldStatus("fout", "Doorsturen mislukt: \(error.localizedDescription)")
                }
            }
        case .notConnected, .connecting:
            break
        @unknown default:
            break
        }
    }

    public func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        guard let tekst = String(data: data, encoding: .utf8) else {
            meldStatus("fout", "Onleesbaar bericht ontvangen")
            return
        }
        notifyListeners("peerData", data: [
            "id": peerID.displayName,
            "naam": peerID.displayName,
            "pakket": tekst
        ])
    }

    // Deze app stuurt alleen kleine berichten, geen bestanden of streams. De
    // methodes moeten bestaan omdat MCSessionDelegate ze verplicht.
    public func session(
        _ session: MCSession,
        didReceive stream: InputStream,
        withName streamName: String,
        fromPeer peerID: MCPeerID
    ) {}

    public func session(
        _ session: MCSession,
        didStartReceivingResourceWithName resourceName: String,
        fromPeer peerID: MCPeerID,
        with progress: Progress
    ) {}

    public func session(
        _ session: MCSession,
        didFinishReceivingResourceWithName resourceName: String,
        fromPeer peerID: MCPeerID,
        at localURL: URL?,
        withError error: Error?
    ) {}
}
