import CoreImage.CIFilterBuiltins
import SwiftUI
import UserNotifications

/// The account this phone governs, what the phone's key may do, and the way out.
struct AccountView: View {
    @Environment(AppModel.self) private var model
    @State private var addMoney = false
    @State private var confirmUnlink = false
    @State private var alerts: UNAuthorizationStatus?
    @State private var site = ""

    var body: some View {
        NavigationStack {
            List {
                if let s = model.snapshot, let linked = model.linked {
                    Section {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(linked.account).font(.title3.bold()).textSelection(.enabled)
                            Text("NEAR \(linked.network.rawValue)").font(.subheadline).foregroundStyle(Ink.muted)
                        }
                        .padding(.vertical, 6)
                        row("In the vault", Money.usd(s.vault))
                        row("In your account", Money.usd(s.held))
                        Button("Add money") { addMoney = true }
                    }
                    .listRowBackground(Ink.surface)

                    Section {
                        row("Code", model.pairingCode)
                        Label("Approves and denies what agents ask for", systemImage: "checkmark")
                        Label("Pauses every agent, revokes any one", systemImage: "checkmark")
                        Label("Cannot send your money anywhere else", systemImage: "xmark")
                        Label("Cannot add keys or agents", systemImage: "xmark")
                        if let key = model.publicKey {
                            Link("See its permissions on NEAR", destination: URL(string: "\(linked.network.explorer)/address/\(linked.account)?tab=accesskeys")!)
                                .accessibilityHint(key)
                        }
                    } header: {
                        Text("This iPhone's key")
                    } footer: {
                        Text("Approving asks for Face ID. Pausing never does, so stopping is always one tap.")
                    }
                    .listRowBackground(Ink.surface)

                    Section {
                        row("Alerts", alerts == .authorized ? "On" : alerts == .denied ? "Off in Settings" : "Not asked")
                        if alerts != .authorized {
                            Button("Turn on alerts") {
                                Task {
                                    if alerts == .denied { await UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
                                    else { await Alerts.shared.requestPermission(); await readAlerts() }
                                }
                            }
                        }
                    } header: { Text("Alerts") } footer: {
                        Text("Leash tells you when an agent is waiting on you.")
                    }
                    .listRowBackground(Ink.surface)

                    Section {
                        TextField("Web app address", text: $site)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .onSubmit { if let url = URL(string: site), url.scheme != nil { model.site = url } }
                        Button("Unlink this iPhone", role: .destructive) { confirmUnlink = true }
                    } header: { Text("Advanced") } footer: {
                        Text("Unlinking forgets the key on this phone. Remove it from your account in Settings on the web.")
                    }
                    .listRowBackground(Ink.surface)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Ink.ground)
            .navigationTitle("Settings")
            .sheet(isPresented: $addMoney) { AddMoneySheet() }
            .confirmationDialog("Unlink this iPhone?", isPresented: $confirmUnlink, titleVisibility: .visible) {
                Button("Unlink", role: .destructive) { model.unlink() }
            }
            .task {
                site = model.site.absoluteString
                await readAlerts()
            }
        }
    }

    private func readAlerts() async {
        alerts = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).foregroundStyle(Ink.muted).monospacedDigit()
        }
    }
}

/// Topping up the vault: USDC already in the account moves in on the web, where the owner's full
/// key lives; on testnet, Circle's faucet hands out test USDC.
struct TopUpSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(Navigator.self) private var nav

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Top up").font(.system(size: 28, weight: .bold)).tracking(-0.8).padding(.top, 28)
            Text("Your agents spend from the vault. Fill it from USDC in your account.").font(.system(size: 15)).foregroundStyle(Ink.muted)
            if let s = model.snapshot {
                RowCard(title: "In your account", subtitle: "Ready to move into the vault") {
                    ZStack { Circle().fill(Ink.raised); Image(systemName: "arrow.down.left").font(.system(size: 17, weight: .medium)) }.frame(width: 46, height: 46)
                } trailing: {
                    Text(Money.usd(s.held)).font(.system(size: 17, weight: .semibold)).monospacedDigit()
                }
            }
            if let owner = model.linked?.account {
                Link(destination: model.site.appending(path: owner)) { Text("Move it into the vault").frame(maxWidth: .infinity) }
                    .buttonStyle(.pill(.primary))
            }
            Button("Receive USDC first") { nav.sheet = .receive }.buttonStyle(.pill(.secondary))
            if model.linked?.network == .testnet {
                Link("Get test USDC from Circle's faucet", destination: URL(string: "https://faucet.circle.com")!)
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.muted).frame(maxWidth: .infinity)
            }
            Spacer()
        }
        .padding(.horizontal, 20)
        .background(Ink.ground)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }
}

/// Where to send USDC: the account's own name, as text and as a QR code.
struct AddMoneySheet: View {
    @Environment(AppModel.self) private var model
    @State private var copied = false

    var body: some View {
        let account = model.linked?.account ?? ""
        VStack(spacing: 20) {
            Text("Add money").font(.title2.bold()).padding(.top, 28)
            Text("Send USDC on NEAR to your account. Then move it into the vault, where your agents spend from.")
                .font(.subheadline).foregroundStyle(Ink.muted).multilineTextAlignment(.center).padding(.horizontal, 12)
            if let qr = QR.image(account) {
                Image(uiImage: qr).interpolation(.none).resizable().scaledToFit()
                    .frame(width: 200, height: 200).padding(16)
                    .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color.white))
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Ink.edge, lineWidth: 0.7))
            }
            Button {
                UIPasteboard.general.string = account
                copied = true
            } label: {
                HStack(spacing: 8) {
                    Text(account).font(.headline).lineLimit(1).truncationMode(.middle)
                    Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.subheadline)
                }
            }
            .buttonStyle(.pill(.secondary, compact: true))
            Spacer()
            if let owner = model.linked?.account {
                Link(destination: model.site.appending(path: owner)) {
                    Text("Move it into the vault on the web").frame(maxWidth: .infinity)
                }
                .buttonStyle(.pill(.primary))
            }
            Text("Runs on NEAR testnet. Test USDC comes from faucet.circle.com.").font(.footnote).foregroundStyle(Ink.faint)
        }
        .padding(20)
        .background(Ink.ground)
        .presentationDragIndicator(.visible)
        .sensoryFeedback(.success, trigger: copied)
    }
}

enum QR {
    static func image(_ text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: .init(scaleX: 10, y: 10)),
              let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// Connecting a new agent happens where the agent lives; the phone hands the person there.
struct ConnectSheet: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let site = model.site
        let local = ["localhost", "127.0.0.1"].contains(site.host() ?? "")
        VStack(alignment: .leading, spacing: 18) {
            Text("Connect an agent").font(.title2.bold()).padding(.top, 28)
            Text("Each agent gets its own key and limits. You can pause or revoke it from here.")
                .font(.subheadline).foregroundStyle(Ink.muted)
            Link(destination: claudeLink(site)) {
                HStack(spacing: 10) { Image("brand-claude").resizable().frame(width: 20, height: 20); Text("Open in Claude") }
            }
            .buttonStyle(.pill(.primary))
            .disabled(local)
            .opacity(local ? 0.4 : 1)
            if let owner = model.linked?.account {
                Link(destination: URL(string: site.appending(path: owner).absoluteString + "#agents")!) {
                    HStack(spacing: 10) { Image("brand-chatgpt").resizable().frame(width: 20, height: 20); Text("ChatGPT, Codex, Cursor and more") }
                }
                .buttonStyle(.pill(.secondary))
            }
            if local {
                Text("Claude reaches Leash over the internet, so Open in Claude works once Leash is online. Set the web app address in Account to use a tunnel.")
                    .font(.footnote).foregroundStyle(Ink.faint)
            }
            Spacer()
        }
        .padding(20)
        .background(Ink.ground)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    private func claudeLink(_ site: URL) -> URL {
        var c = URLComponents(string: "https://claude.ai/customize/connectors")!
        c.queryItems = [.init(name: "modal", value: "add-custom-connector"), .init(name: "connectorName", value: "Leash"), .init(name: "connectorUrl", value: site.appending(path: "api/mcp").absoluteString)]
        return c.url!
    }
}
