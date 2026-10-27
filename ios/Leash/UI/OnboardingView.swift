import AVFoundation
import SwiftUI

/// The first screen: the web's hero film full bleed, the promise over it, and the same three ways
/// in as the web. Each opens the web sign-in on that provider; it links this phone and comes back.
struct OnboardingView: View {
    @Environment(AppModel.self) private var model
    @State private var working: Pairing.Provider?
    @State private var editingSite = false
    @State private var site = ""

    var body: some View {
        ZStack(alignment: .bottom) {
            LoopingVideo(name: "hero").ignoresSafeArea()
            LinearGradient(stops: [.init(color: .black.opacity(0.35), location: 0), .init(color: .clear, location: 0.22), .init(color: .clear, location: 0.38), .init(color: .black.opacity(0.92), location: 0.72), .init(color: .black, location: 1)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                // A phone cannot reach the Mac's localhost; holding the name sets a tunnel address.
                HStack(spacing: 8) {
                    Image("mark").resizable().frame(width: 24, height: 24)
                    Text("Leash").font(.system(size: 22, weight: .semibold)).tracking(-0.4)
                }
                .onLongPressGesture {
                    site = model.site.absoluteString
                    editingSite = true
                }
                .alert("Web app address", isPresented: $editingSite) {
                    TextField("https://…", text: $site).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Save") { if let url = URL(string: site.trimmingCharacters(in: .whitespaces)), url.scheme != nil { model.site = url } }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("Where Leash's web app runs, for example your ngrok address.")
                }
                Spacer()
                Text("Your agents can pay now.")
                    .font(.system(size: 40, weight: .bold)).tracking(-1.2)
                Text("Only what you allow.")
                    .font(.system(size: 40, weight: .bold)).tracking(-1.2).foregroundStyle(.white.opacity(0.55))
                Text("Approve what they ask for, pause them all, revoke any one. From your phone, enforced on NEAR.")
                    .font(.system(size: 16)).foregroundStyle(.white.opacity(0.75))
                    .padding(.top, 12).padding(.bottom, 28)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(spacing: 10) {
                    button(.google, "Continue with Google", image: "brand-google", kind: .light)
                    button(.apple, "Continue with Apple", image: "brand-apple", kind: .light)
                    button(.passkey, "Continue with passkey", system: "person.badge.key", kind: .glass)
                }

                if let problem = model.linkProblem {
                    Text(problem).font(.footnote).foregroundStyle(Ink.danger).padding(.top, 12)
                }
                HStack(spacing: 6) {
                    Text("This iPhone")
                    Text(model.pairingCode).monospaced().foregroundStyle(.white.opacity(0.8))
                    Text("· NEAR testnet")
                }
                .font(.footnote).foregroundStyle(.white.opacity(0.5))
                .frame(maxWidth: .infinity).padding(.top, 16)
            }
            .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 12)
        }
        .background(Color.black)
    }

    private func button(_ provider: Pairing.Provider, _ title: String, image: String? = nil, system: String? = nil, kind: PillButtonStyle.Kind) -> some View {
        Button {
            working = provider
            Task {
                await model.link(with: provider)
                working = nil
            }
        } label: {
            HStack(spacing: 10) {
                if working == provider { ProgressView().tint(kind == .light ? .black : .white) }
                else if let image { Image(image).resizable().scaledToFit().frame(width: 19, height: 19).foregroundStyle(.black) }
                else if let system { Image(systemName: system).font(.system(size: 17, weight: .medium)) }
                Text(title)
            }
        }
        .buttonStyle(.pill(kind))
        .disabled(working != nil)
    }
}

/// A muted, looping film that fills its frame.
struct LoopingVideo: UIViewRepresentable {
    let name: String

    func makeUIView(context: Context) -> PlayerView {
        let view = PlayerView()
        guard let url = Bundle.main.url(forResource: name, withExtension: "mp4") else { return view }
        let player = AVQueuePlayer()
        player.isMuted = true
        player.preventsDisplaySleepDuringVideoPlayback = false
        view.looper = AVPlayerLooper(player: player, templateItem: AVPlayerItem(url: url))
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspectFill
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: .mixWithOthers)
        player.play()
        return view
    }

    func updateUIView(_ view: PlayerView, context: Context) {}

    final class PlayerView: UIView {
        var looper: AVPlayerLooper?
        override static var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
