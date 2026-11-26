import Foundation
import Capacitor
import Security
import UIKit
import WebKit

// App-local random secret. Never sync or include in device backups.
@objc(DKPVaultPlugin)
public class DKPVaultPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DKPVaultPlugin"
    public let jsName = "DKPVault"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "readSecret", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "createSecret", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "rememberLogin", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "readLogin", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "forgetLogin", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "readSafeArea", returnType: CAPPluginReturnPromise)]
    // Use UIKit measurements only for the region actually covered by the web view.
    @objc func readSafeArea(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView, webView.window != nil else {
                call.reject("Safe area not available yet."); return
            }
            let i = webView.safeAreaInsets
            call.resolve(["top": Double(i.top), "right": Double(i.right),
                          "bottom": Double(i.bottom), "left": Double(i.left)])
        }
    }
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "vn.dkp.demo.vault.r4711b",
         kSecAttrAccount as String: "local-encryption-secret",
         kSecAttrSynchronizable as String: false]
    }
    // Separate marker, never modifies the existing encryption key. Local permission only.
    private var loginQuery: [String: Any] {
        var q = query
        q[kSecAttrAccount as String] = "remembered-demo-login-v1"
        return q
    }
    private func writeLogin(_ expiry: Int64, _ call: CAPPluginCall) {
        let data = Data(String(expiry).utf8)
        let q = loginQuery
        var status = SecItemUpdate(q as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var add = q
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(add as CFDictionary, nil)
            if status == errSecDuplicateItem {
                status = SecItemUpdate(q as CFDictionary, [kSecValueData as String: data] as CFDictionary)
            }
        }
        guard status == errSecSuccess else { call.reject("Không cập nhật được phiên Keychain."); return }
        call.resolve(["ok": true, "expiresAt": expiry])
    }
    @objc func rememberLogin(_ call: CAPPluginCall) {
        writeLogin(Int64(Date().timeIntervalSince1970 * 1000) + 28_800_000, call)
    }
    @objc func forgetLogin(_ call: CAPPluginCall) { writeLogin(0, call) }
    @objc func readLogin(_ call: CAPPluginCall) {
        var q = loginQuery
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        if status == errSecItemNotFound { call.resolve(["expiresAt": 0]); return }
        guard status == errSecSuccess, let data = item as? Data,
              let raw = String(data: data, encoding: .utf8), let expiry = Int64(raw) else {
            call.reject("Không đọc được phiên Keychain."); return
        }
        call.resolve(["expiresAt": expiry])
    }
    private func read(_ call: CAPPluginCall) {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        if status == errSecItemNotFound { call.resolve(["found": false]); return }
        guard status == errSecSuccess, let data = item as? Data, data.count == 32 else {
            call.reject("Không truy cập được khóa Keychain."); return
        }
        call.resolve(["found": true, "secret": data.base64EncodedString()])
    }
    @objc func readSecret(_ call: CAPPluginCall) { read(call) }
    @objc func createSecret(_ call: CAPPluginCall) {
        var bytes = [UInt8](repeating: 0, count: 32)
        let randomStatus = bytes.withUnsafeMutableBytes { buffer -> OSStatus in
            guard let ptr = buffer.baseAddress else { return errSecParam }
            return SecRandomCopyBytes(kSecRandomDefault, buffer.count, ptr)
        }
        guard randomStatus == errSecSuccess else { call.reject("Không tạo được khóa ngẫu nhiên."); return }
        var q = query
        q[kSecValueData as String] = Data(bytes)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(q as CFDictionary, nil)
        guard status == errSecSuccess || status == errSecDuplicateItem else {
            call.reject("Không lưu được khóa Keychain."); return
        }
        read(call)
    }
}

@objc(DKPBridgeViewController)
public class DKPBridgeViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(DKPVaultPlugin())
    }
}
