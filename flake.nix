{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/26.05";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
          overlays = [
            (import ./overlays/spacetimedb.nix)
            (import ./overlays/pnpm.nix)
            (import rust-overlay)
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
              # cargo, rustc, clippy, rustfmt and rust-analyzer, pinned in
              # rust-toolchain.toml.
              (rust-bin.fromRustupToolchainFile ./rust-toolchain.toml)
              lldb
              iconv
            ];
          };
      });
}
