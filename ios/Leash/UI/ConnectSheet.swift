import SwiftUI

/// Connecting an agent. Claude and ChatGPT add Leash in their own settings and come back through
/// its sign-in; Claude Code, Codex and Cursor get a key made right here, with their limits, and a
/// line to paste into the agent.
struct ConnectSheet: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Each agent gets its own key and its own limits. Pause or revoke any of them from this phone.")
                        .font(.system(size: 15)).foregroundStyle(Ink.muted).padding(.bottom, 14)
                    Link(destination: claudeLink) { option("claude", "Claude", "Adds Leash in Claude's settings", external: true) }
                    NavigationLink { ChatGptSteps(url: connectorUrl) } label: { option("chatgpt", "ChatGPT", "Adds Leash as a plugin, step by step") }
                    Text("On your computer").font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.muted).padding(.top, 18).padding(.bottom, 2)
                    ForEach(AgentKind.allCases) { kind in
                        NavigationLink { NewAgentForm(kind: kind) } label: { option(kind.brand, kind.label, "Made here, set up with one line") }
                    }
                }
                .padding(.horizontal, 20).padding(.bottom, 24)
            }
            .groundBackground()
            .navigationTitle("Connect an agent")
            .navigationBarTitleDisplayMode(.large)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func option(_ brand: String, _ title: String, _ line: String, external: Bool = false) -> some View {
        RowCard(title: title, subtitle: line) {
            Image("brand-\(brand)").resizable().scaledToFit().frame(width: 22, height: 22)
                .frame(width: 46, height: 46).background(Circle().fill(Ink.ground))
        } trailing: {
            Image(systemName: external ? "arrow.up.right" : "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(Ink.muted)
        }
        .foregroundStyle(Ink.text)
    }

    private var connectorUrl: String { model.site.appending(path: "api/mcp").absoluteString }

    private var claudeLink: URL {
        var c = URLComponents(string: "https://claude.ai/customize/connectors")!
        c.queryItems = [.init(name: "modal", value: "add-custom-connector"), .init(name: "connectorName", value: "Leash"), .init(name: "connectorUrl", value: connectorUrl)]
        return c.url!
    }
}

enum AgentKind: String, CaseIterable, Identifiable {
    case claude, codex, cursor
    var id: String { rawValue }
    var label: String { ["claude": "Claude Code", "codex": "Codex", "cursor": "Cursor"][rawValue]! }
    var brand: String { rawValue }

    /// The real line that installs Leash in this agent, with its key inside. Same as the web's.
    func setup(_ file: AgentKeyFile) -> (where: String, code: String) {
        let key = file.inline
        switch self {
        case .claude: return ("In your terminal", "claude mcp add --scope user leash -e LEASH_KEY=\(key) -- npx -y leash-near-mcp")
        case .codex: return ("In your terminal", "codex mcp add leash --env LEASH_KEY=\(key) -- npx -y leash-near-mcp")
        case .cursor:
            let config = "{\n  \"mcpServers\": {\n    \"leash\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"leash-near-mcp\"],\n      \"env\": { \"LEASH_KEY\": \"\(key)\" }\n    }\n  }\n}"
            return ("In ~/.cursor/mcp.json", config)
        }
    }
}

/// Name and limits for a new agent, then the phone signs its key onto the account.
struct NewAgentForm: View {
    @Environment(AppModel.self) private var model
    let kind: AgentKind
    @State private var name = ""
    @State private var daily = "5"
    @State private var perPayment = "2"
    @State private var recipients = ""
    @State private var made: AgentKeyFile?
    @State private var working = false

    var body: some View {
        let d = Money.parse(daily), p = Money.parse(perPayment)
        let problem = nameProblem ?? limitsProblem(daily: d, perPayment: p)
        Group {
            if let made {
                AgentMadeView(kind: kind, file: made)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Name").font(.system(size: 16)).foregroundStyle(Ink.muted)
                            Spacer()
                            TextField(kind.rawValue, text: $name).font(.system(size: 18, weight: .semibold)).multilineTextAlignment(.trailing)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                        }
                        .padding(.horizontal, 16).frame(height: 64)
                        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Ink.surface))
                        MoneyField(label: "Daily limit", text: $daily)
                        MoneyField(label: "Pays alone up to", text: $perPayment)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Only these accounts").font(.system(size: 14)).foregroundStyle(Ink.muted)
                            TextField("Anyone", text: $recipients).font(.system(size: 17)).textInputAutocapitalization(.never).autocorrectionDisabled()
                        }
                        .padding(16)
                        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Ink.surface))
                        Text(problem ?? "Above \(Money.short(p ?? 0)) it asks you first. It can never spend more than \(Money.short(d ?? 0)) a day.")
                            .font(.system(size: 14)).foregroundStyle(problem == nil ? Ink.muted : Ink.danger).padding(.top, 4)
                    }
                    .padding(.horizontal, 20)
                }
                .safeAreaInset(edge: .bottom) {
                    Button {
                        working = true
                        Task {
                            defer { working = false }
                            let list = recipients.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                            guard let d, let p, await model.ensureOwnerKey() else { return }
                            made = await model.createAgent(name: agentName, daily: d, perPayment: p, allowlist: list)
                        }
                    } label: {
                        HStack(spacing: 8) {
                            if working { ProgressView().tint(Ink.inverse) }
                            Text("Create \(agentName)")
                        }
                    }
                    .buttonStyle(.pill(.primary))
                    .disabled(problem != nil || working)
                    .padding(.horizontal, 20).padding(.bottom, 8)
                    .background(Ink.groundEnd)
                }
            }
        }
        .groundBackground()
        .navigationTitle(made == nil ? kind.label : "\(made!.name) is ready")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(made != nil)
        .onAppear { if name.isEmpty { name = freeName } }
    }

    private var agentName: String { name.trimmingCharacters(in: .whitespaces).lowercased() }

    private var nameProblem: String? {
        if agentName.range(of: "^[a-z0-9-]{1,32}$", options: .regularExpression) == nil { return "Name it with lowercase letters, numbers and -." }
        if model.snapshot?.agents.contains(where: { $0.name == agentName && $0.policy.active }) == true { return "You already have an agent called \(agentName)." }
        return nil
    }

    /// "claude", or "claude-2" when that is taken.
    private var freeName: String {
        let taken = Set(model.snapshot?.agents.map(\.name) ?? [])
        if !taken.contains(kind.rawValue) { return kind.rawValue }
        return (2...99).map { "\(kind.rawValue)-\($0)" }.first { !taken.contains($0) } ?? kind.rawValue
    }
}

/// The agent exists; this hands over its key, inside the line that installs Leash. Shown once.
struct AgentMadeView: View {
    @Environment(Navigator.self) private var nav
    let kind: AgentKind
    let file: AgentKeyFile
    @State private var copied = false

    var body: some View {
        let setup = kind.setup(file)
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack(spacing: 14) {
                    Avatar(actor: .agent(file.name), size: 56)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(file.name) is on a leash").font(.system(size: 22, weight: .bold)).tracking(-0.5)
                        Text("Its key is made and its limits are set.").font(.system(size: 14)).foregroundStyle(Ink.muted)
                    }
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text("Add Leash to \(kind.label)").font(.system(size: 17, weight: .semibold))
                    Text("\(setup.where), on your computer. The key is inside and is shown only now.").font(.system(size: 14)).foregroundStyle(Ink.muted)
                    Text(setup.code)
                        .font(.system(size: 12, design: .monospaced)).lineLimit(8).truncationMode(.middle)
                        .textSelection(.enabled)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Ink.surface))
                    HStack(spacing: 10) {
                        Button {
                            UIPasteboard.general.string = setup.code
                            copied = true
                        } label: { Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc").labelStyle(PillLabel()) }
                        .buttonStyle(.pill(.primary))
                        ShareLink(item: setup.code) { Label("AirDrop", systemImage: "square.and.arrow.up").labelStyle(PillLabel()) }
                            .buttonStyle(.pill(.secondary))
                    }
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Then ask it to pay").font(.system(size: 17, weight: .semibold))
                    Text("Under its limit it pays on its own. Above, it lands here for you to approve.").font(.system(size: 14)).foregroundStyle(Ink.muted)
                }
            }
            .padding(20)
        }
        .safeAreaInset(edge: .bottom) {
            Button("Done") { nav.sheet = nil }.buttonStyle(.pill(.secondary)).padding(.horizontal, 20).padding(.bottom, 8).background(Ink.groundEnd)
        }
        .sensoryFeedback(.success, trigger: copied)
    }
}

/// ChatGPT has no install link, so these are the steps, with the address ready to copy.
struct ChatGptSteps: View {
    let url: String
    @State private var copied = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                step(1, "Turn on developer mode", "On chatgpt.com, in Settings, Security and login. It is on the web only, not ChatGPT's app.")
                step(2, "Add Leash", "Plugins, Browse plugins, +, New plugin. Name it Leash, paste this address and choose OAuth.")
                Button {
                    UIPasteboard.general.string = url
                    copied = true
                } label: {
                    HStack {
                        Text(url).font(.system(size: 14, design: .monospaced)).lineLimit(1).truncationMode(.middle)
                        Spacer()
                        Image(systemName: copied ? "checkmark" : "doc.on.doc")
                    }
                    .padding(16)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Ink.surface))
                }
                .foregroundStyle(Ink.text)
                step(3, "Allow it", "ChatGPT opens Leash to sign in and set its limits. It then shows up in Agents here.")
            }
            .padding(20)
        }
        .groundBackground()
        .navigationTitle("ChatGPT")
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.success, trigger: copied)
    }

    private func step(_ n: Int, _ title: String, _ line: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text("\(n)").font(.system(size: 15, weight: .bold)).foregroundStyle(Ink.inverse)
                .frame(width: 30, height: 30).background(Circle().fill(Ink.text))
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.system(size: 17, weight: .semibold))
                Text(line).font(.system(size: 14)).foregroundStyle(Ink.muted)
            }
        }
    }
}
