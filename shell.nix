# Optional NixOS development environment. The desktop app itself never installs tools.
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = with pkgs; [ nodejs_24 go cargo rustc electron chromium gcc gnumake python3 pkg-config zip ];
  ELECTRON_OVERRIDE_DIST_PATH = "${pkgs.electron}/bin";
  ELECTRON_EXEC_PATH = "${pkgs.electron}/bin/electron";
  ELECTRON_PATH = "${pkgs.electron}/bin/electron";
  CHROMIUM_PATH = "${pkgs.chromium}/bin/chromium";
  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib ];
}
