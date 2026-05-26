// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MediaLog",
    platforms: [
        .iOS(.v17)
    ],
    products: [
        .executable(name: "MediaLog", targets: ["MediaLog"])
    ],
    targets: [
        .executableTarget(name: "MediaLog")
    ]
)
