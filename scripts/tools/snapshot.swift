// Renders a local HTML file to a PNG at an exact pixel size using WebKit.
// Build: swiftc -O scripts/tools/snapshot.swift -o scripts/tools/snapshot
// Use:   scripts/tools/snapshot <in.html> <out.png> <width> <height>
import Cocoa
import WebKit

let args = CommandLine.arguments
guard args.count == 5, let w = Double(args[3]), let h = Double(args[4]) else {
  FileHandle.standardError.write("usage: snapshot <in.html> <out.png> <width> <height>\n".data(using: .utf8)!)
  exit(2)
}
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

final class Delegate: NSObject, WKNavigationDelegate {
  let out: String
  let w: Double
  let h: Double
  init(out: String, w: Double, h: Double) { self.out = out; self.w = w; self.h = h }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    // Give fonts a beat to settle, then snapshot.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
      let cfg = WKSnapshotConfiguration()
      cfg.rect = CGRect(x: 0, y: 0, width: self.w, height: self.h)
      cfg.snapshotWidth = NSNumber(value: self.w)
      webView.takeSnapshot(with: cfg) { image, error in
        guard let image = image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else {
          FileHandle.standardError.write("snapshot failed: \(error.map { "\($0)" } ?? "no image")\n".data(using: .utf8)!)
          exit(1)
        }
        do { try png.write(to: URL(fileURLWithPath: self.out)) } catch { exit(1) }
        exit(0)
      }
    }
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { exit(1) }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { exit(1) }
}

let config = WKWebViewConfiguration()
let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: w, height: h), configuration: config)
let window = NSWindow(contentRect: webView.frame, styleMask: [.borderless], backing: .buffered, defer: false)
window.contentView = webView
let delegate = Delegate(out: args[2], w: w, h: h)
webView.navigationDelegate = delegate
let url = URL(fileURLWithPath: args[1])
webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent())
app.run()
