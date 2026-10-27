import XCTest

/// Walks every screen of a linked phone (read-only, a real testnet owner) and saves a screenshot
/// of each to SHOTS, for review and for the demo. Fails fast unless SHOTS is set.
final class ScreensTests: XCTestCase {
    func testWalkThroughScreens() throws {
        let out = try XCTUnwrap(ProcessInfo.processInfo.environment["SHOTS"], "set TEST_RUNNER_SHOTS to a folder")
        let app = XCUIApplication()
        app.launchArguments = ["-leash.account", ProcessInfo.processInfo.environment["OWNER"] ?? "olien.testnet", "-leash.network", "testnet", "-leash.tab", "agents"]
        app.launch()
        func shot(_ name: String) {
            sleep(2)
            try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: out).appending(path: "\(name).png"))
        }
        XCTAssertTrue(app.staticTexts["Agents"].waitForExistence(timeout: 20))
        shot("1-home")
        app.buttons["Pause all"].tap()
        shot("2-pause-confirm")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.62)).tap()
        app.buttons["Add money"].tap()
        shot("3-add-money")
        app.swipeDown(velocity: .fast)
        app.buttons["Connect agent"].tap()
        shot("4-connect")
        app.swipeDown(velocity: .fast)
        app.staticTexts["claude-2"].firstMatch.tap()
        shot("5-agent")
        app.swipeUp()
        shot("6-agent-lower")
        for (i, tab) in ["activity", "account"].enumerated() {
            app.terminate()
            app.launchArguments = app.launchArguments.dropLast(2) + ["-leash.tab", tab]
            app.launch()
            sleep(4)
            shot("\(7 + i)-\(tab)")
        }
    }

    /// A fresh phone: the email button opens the web's link page in Apple's sign-in sheet.
    func testLinkSheetOpensTheWebPage() throws {
        let out = try XCTUnwrap(ProcessInfo.processInfo.environment["SHOTS"])
        let app = XCUIApplication()
        app.launchArguments = ["-leash.account", "", "-leash.network", ""]
        app.launch()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        app.buttons["Continue with email"].tap()
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
}
