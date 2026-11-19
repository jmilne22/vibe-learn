# Optional NixOS development environment.
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = with pkgs; [ nodejs_24 go chromium ];
  CHROMIUM_PATH = "${pkgs.chromium}/bin/chromium";
}
