{
  description = "A basic flake with a shell";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system: 
      let pkgs = import nixpkgs {
        overlays = [ (final: prev: {
              nodejs = prev.nodejs-19_x;
        }) ];
        inherit system;
      };
    in {
      devShells.default = pkgs.mkShell {
        nativeBuildInputs = [ pkgs.nodejs-19_x pkgs.nodePackages.pnpm ];
        buildInputs = [ ];
      };
    });
}
