import XCTest

/// Walks every screen of a linked phone (read-only, a real testnet owner) and saves a screenshot
/// of each to SHOTS, for review and for the demo. Fails fast unless SHOTS is set.
final class ScreensTests: XCTestCase {
    func testWalkThroughScreens() throws {
        let out = try XCTUnwrap(ProcessInfo.processInfo.environment["SHOTS"], "set TEST_RUNNER_SHOTS to a folder")
        let app = XCUIApplication()
        app.launchArguments = ["-leash.account", ProcessInfo.processInfo.environment["OWNER"] ?? "olien.testnet", "-leash.network", "testnet", "-leash.tab", "overview"]
        app.launch()
        func shot(_ name: String) {
            sleep(2)
            try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: out).appending(path: "\(name).png"))
        }
        XCTAssertTrue(app.staticTexts["Your agents"].waitForExistence(timeout: 20))
        shot("1-overview")
        app.buttons["Top up"].tap()
        shot("2-top-up")
        app.swipeDown(velocity: .fast)
        app.buttons["Receive USDC"].tap()
        shot("3-receive")
        app.swipeDown(velocity: .fast)
        app.buttons["Agents"].tap()
        shot("4-agents")
        app.buttons["Pause all"].tap()
        shot("5-pause")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75)).tap()
        app.staticTexts["claude-2"].firstMatch.tap()
        shot("6-agent")
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["Approvals"].tap()
        shot("7-approvals")
        app.buttons["Activity"].tap()
        shot("8-activity")
        app.buttons["Overview"].tap()
        app.buttons["Settings"].tap()
        shot("9-settings")
    }

    /// A fresh phone: the passkey button opens the web's link page in Apple's sign-in sheet.
    func testLinkSheetOpensTheWebPage() throws {
        let out = try XCTUnwrap(ProcessInfo.processInfo.environment["SHOTS"])
        let app = XCUIApplication()
        app.launchArguments = ["-leash.account", "", "-leash.network", ""]
        app.launch()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        app.buttons["Continue with passkey"].tap()
        let allow = springboard.buttons["Continue"]
        if allow.waitForExistence(timeout: 5) { allow.tap() }
        sleep(8)
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: out).appending(path: "9-link-sheet.png"))
    }

    /// The host sends demo/parked.apns with simctl while this waits on the home screen.
    func testParkedRequestAlert() throws {
        let out = try XCTUnwrap(ProcessInfo.processInfo.environment["SHOTS"])
        let app = XCUIApplication()
        app.launchArguments = ["-leash.account", "olien.testnet", "-leash.network", "testnet"]
        app.launch()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.buttons["Allow"]
        if allow.waitForExistence(timeout: 8) { allow.tap() }
        sleep(2)
        XCUIDevice.shared.press(.home)
        let banner = springboard.otherElements["Notification"].descendants(matching: .any)["claude wants to pay $42.00"]
        XCTAssertTrue(banner.waitForExistence(timeout: 40))
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: out).appending(path: "10-alert.png"))
        banner.press(forDuration: 1.2)
        sleep(2)
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: out).appending(path: "11-alert-actions.png"))
    }

    /// An owner with a parked request (OWNER): the app starts a Live Activity for it, which shows in
    /// the Dynamic Island once the app is in the background.
    func testWaitingRequestGoesLive() throws {
        let out = try XCTUnwrap(ProcessInfo.processInfo.environment["SHOTS"])
        let owner = try XCTUnwrap(ProcessInfo.processInfo.environment["OWNER"])
        let app = XCUIApplication()
        app.launchArguments = ["-leash.account", owner, "-leash.network", "testnet", "-leash.tab", "approvals"]
        app.launch()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        if springboard.buttons["Allow"].waitForExistence(timeout: 5) { springboard.buttons["Allow"].tap() }
        XCTAssertTrue(app.staticTexts["claude wants to pay"].waitForExistence(timeout: 30))
        sleep(3)
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: out).appending(path: "20-approvals.png"))
        app.staticTexts["claude wants to pay"].tap()
        sleep(4)
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: out).appending(path: "21-request.png"))
        XCUIDevice.shared.press(.home)
        sleep(3)
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: out).appending(path: "22-island.png"))
    }
}
