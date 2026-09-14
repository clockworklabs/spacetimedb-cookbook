# @update github-release clockworklabs/SpacetimeDB
# SpacetimeDB - distributed database with intelligent modules
#
# Upstream publishes prebuilt binaries only; nothing is built from source here,
# so every supported platform needs its own tarball URL and hash in `sources`
# below.
#
# To update to the latest version:
# 1. Check latest release:
#    curl -s https://api.github.com/repos/clockworklabs/SpacetimeDB/releases/latest | jq -r '.tag_name'
#
# 2. Update the version number below (without the 'v' prefix)
#
# 3. Re-hash every entry in `sources` (nix-prefetch-url caches into the store,
#    so the build that follows won't re-download):
#
#      V=2.10.0
#      for T in aarch64-apple-darwin x86_64-apple-darwin \
#               aarch64-unknown-linux-gnu x86_64-unknown-linux-gnu; do
#        U="https://github.com/clockworklabs/SpacetimeDB/releases/download/v$V/spacetime-$T.tar.gz"
#        echo "$T  $(nix hash convert --hash-algo sha256 --to sri \
#                     "$(nix-prefetch-url "$U")")"
#      done
#
# 4. Test: nix build .#spacetimedb
#
# Note: Tarball contains two binaries at root level:
#   - spacetimedb-cli (installed as 'spacetime')
#   - spacetimedb-standalone
#
# GitHub: https://github.com/clockworklabs/SpacetimeDB
# Releases: https://github.com/clockworklabs/SpacetimeDB/releases

final: prev:

let
  version = "2.10.0";

  # Nix system -> the Rust target triple upstream names its tarball after.
  # Upstream also ships x86_64-pc-windows-msvc, which Nix has no use for.
  sources = {
    aarch64-darwin = {
      target = "aarch64-apple-darwin";
      hash = "sha256-m1YUC4ivi6ESd8JPu4F30gGWsZJS7miQOQo6tfJ3Peo=";
    };
    x86_64-darwin = {
      target = "x86_64-apple-darwin";
      hash = "sha256-L/qKT0F6GcEj8q9Qy6ILQzMcYf4lMGhIORpa1PQnlp0=";
    };
    aarch64-linux = {
      target = "aarch64-unknown-linux-gnu";
      hash = "sha256-mrdP1wg++iX/Pc8NEDmBWWi9ZJgW4NIQgQwAs60idDA=";
    };
    x86_64-linux = {
      target = "x86_64-unknown-linux-gnu";
      hash = "sha256-IYgJmrHd5KmgyogzT7EEQOuVCb3K6TtO8RR8embI5wI=";
    };
  };

  inherit (prev.stdenv.hostPlatform) isLinux system;

  source = sources.${system} or (throw
    "spacetimedb: upstream publishes no build for ${system} (have: ${
      prev.lib.concatStringsSep ", " (builtins.attrNames sources)
    })");
in
{
  spacetimedb = prev.stdenv.mkDerivation {
    pname = "spacetime";
    inherit version;

    src = prev.fetchurl {
      url = "https://github.com/clockworklabs/SpacetimeDB/releases/download/v${version}/spacetime-${source.target}.tar.gz";
      inherit (source) hash;
    };

    # No subdirectory in tarball, binaries are at root
    sourceRoot = ".";

    # The Linux tarballs are ordinary dynamically-linked ELF executables built
    # against a distro glibc: they ask for the interpreter at
    # /lib64/ld-linux-*.so, which doesn't exist on a Nix-managed system.
    # autoPatchelfHook rewrites the interpreter and RPATH to point into the
    # store. The Mach-O binaries need no equivalent fixup.
    nativeBuildInputs = prev.lib.optional isLinux prev.autoPatchelfHook;

    buildInputs = prev.lib.optionals isLinux [
      prev.zlib # libz.so.1 (spacetimedb-cli, x86_64 only)
      prev.stdenv.cc.cc.lib # libgcc_s.so.1, libstdc++.so.6
    ];

    installPhase = ''
      runHook preInstall

      mkdir -p $out/bin

      # Install the CLI binary as 'spacetime' (matching upstream name)
      install -m755 spacetimedb-cli $out/bin/spacetime

      # Install the standalone server
      install -m755 spacetimedb-standalone $out/bin/spacetimedb-standalone

      runHook postInstall
    '';

    meta = with prev.lib; {
      description = "SpacetimeDB CLI and standalone server - a distributed database with intelligent modules";
      homepage = "https://spacetimedb.com";
      license = licenses.bsl11; # Business Source License 1.1 - converts to AGPL-3.0 on 2030-10-31
      platforms = builtins.attrNames sources;
      mainProgram = "spacetime";
    };
  };
}
