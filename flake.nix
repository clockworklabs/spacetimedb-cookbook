{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/26.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
          overlays = [
            (import ./overlays/spacetimedb.nix)
            (import ./overlays/pnpm.nix)
          ];
        };

      in
      {
        packages = { };

        devShells.default = with pkgs;
          mkShell {
            buildInputs = [
              # Spacetime
              spacetimedb

              # TypeScript
              nodejs_26
              pnpm
              typescript
              typescript-language-server
              svelte-language-server
              prettier
              esbuild

              # Rust
              cargo-generate
              cargo-watch
              rustup
              rust-analyzer
              lldb
              iconv
            ];
          };
      });
}
