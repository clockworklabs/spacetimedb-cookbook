# @update npm pnpm
# pnpm 12 - nixpkgs 26.05 only ships up to pnpm_11 (11.4.0).
#
# pnpm 12 is the Rust rewrite, and that changes how it has to be packaged.
# Overriding nixpkgs' pnpm_11 derivation with a 12.x version/hash builds, but
# the result tries to phone home on first run:
#
#   Downloading the pnpm 12.3.1 binary for darwin-arm64...
#   Could not download the pnpm 12.3.1 binary: Could not reach
#   https://registry.npmjs.org/@pnpm/exe.darwin-arm64/12.3.1
#
# The `pnpm` npm package is now a wrapper: its `pnpm` bin is a placeholder Node
# script, and a preinstall script (install.js) overwrites it with the native
# binary from the `@pnpm/exe.<target>` optional dependency for the host. Nix
# runs no lifecycle scripts and fetchurl gets no optional deps, so we do that
# placement ourselves: fetch both tarballs and copy the binary over the
# placeholder.
#
# The wrapper package is still needed alongside it - the binary locates the
# `dist/` payload (its bundled node-gyp) relative to its own path, and `pn`,
# `pnpx` and `pnx` are `#!/bin/sh` scripts that live there too. Hence
# $out/libexec/pnpm holding the unpacked wrapper, with $out/bin symlinks into
# it; `current_exe()` resolves the symlink, so `dist/` is still found.
#
# To update:
#   1. Latest 12.x: npm view pnpm dist-tags   (look at latest-12)
#   2. Bump `version`, then refresh every hash. For the wrapper:
#        nix hash convert --hash-algo sha256 --to sri "$(nix-prefetch-url \
#          https://registry.npmjs.org/pnpm/-/pnpm-VERSION.tgz)"
#      and for each target in `targets` below:
#        nix hash convert --hash-algo sha256 --to sri "$(nix-prefetch-url \
#          https://registry.npmjs.org/@pnpm/exe.TARGET/-/exe.TARGET-VERSION.tgz)"
final: prev:
let
  inherit (prev) lib stdenvNoCC fetchurl;

  version = "12.3.4";

  wrapperSrc = fetchurl {
    url = "https://registry.npmjs.org/pnpm/-/pnpm-${version}.tgz";
    hash = "sha256-CKPS1Tmzd6a36iRpthJnIlXKccMKYmmFMFgsudNcJo8=";
  };

  # Nix system -> the npm target whose @pnpm/exe.<target> package holds the
  # binary. The musl variants (linux-x64-musl, linux-arm64-musl) exist upstream
  # but aren't wired up here.
  targets = {
    aarch64-darwin = {
      target = "darwin-arm64";
      hash = "sha256-9UrTZ9ikLa+dhIMOS9akXAlX4OMoekXaCMOguNBOx/c=";
    };
    x86_64-darwin = {
      target = "darwin-x64";
      hash = "sha256-3kEPwxUxsbekQMjoDeHPdmPMMp/lMKUjJIIT8bL5bK8=";
    };
    x86_64-linux = {
      target = "linux-x64";
      hash = "sha256-mxyV/EE2AMp1pR6+gzLXAZ3DVo/UGH9aXy30oVbvtlw=";
    };
    aarch64-linux = {
      target = "linux-arm64";
      hash = "sha256-q1Nm6VLbwoETQhp8fd/bBMm7ZClYuPU+pVg4VEJr1I0=";
    };
  };

  hostSystem = stdenvNoCC.hostPlatform.system;

  native =
    targets.${hostSystem}
      or (throw "pnpm ${version}: no prebuilt binary packaged for ${hostSystem}");

  nativeSrc = fetchurl {
    url = "https://registry.npmjs.org/@pnpm/exe.${native.target}/-/exe.${native.target}-${version}.tgz";
    inherit (native) hash;
  };

  pnpm_12 = stdenvNoCC.mkDerivation {
    pname = "pnpm";
    inherit version;

    srcs = [ wrapperSrc nativeSrc ];

    nativeBuildInputs = [ prev.installShellFiles ];

    unpackPhase = ''
      runHook preUnpack
      mkdir wrapper native
      tar -xzf ${wrapperSrc} -C wrapper --strip-components=1
      tar -xzf ${nativeSrc} -C native --strip-components=1
      runHook postUnpack
    '';

    installPhase = ''
      runHook preInstall

      install -d $out/{bin,libexec}
      cp -R wrapper $out/libexec/pnpm

      # What install.js does on a normal npm install: replace the placeholder
      # Node script with the host's native binary.
      install -m755 native/pnpm $out/libexec/pnpm/pnpm

      for bin in pnpm pn pnpx pnx; do
        chmod +x $out/libexec/pnpm/$bin
        ln -s $out/libexec/pnpm/$bin $out/bin/$bin
      done

      runHook postInstall
    '';

    postInstall = ''
      $out/bin/pnpm completion bash >pnpm.bash
      $out/bin/pnpm completion fish >pnpm.fish
      $out/bin/pnpm completion zsh >pnpm.zsh
      sed -i '1 i#compdef pnpm' pnpm.zsh
      installShellCompletion pnpm.{bash,fish,zsh}
    '';

    dontBuild = true;
    dontConfigure = true;
    dontStrip = true;
    strictDeps = true;

    passthru.majorVersion = lib.versions.major version;

    meta = {
      description = "Fast, disk space efficient package manager for JavaScript";
      homepage = "https://pnpm.io/";
      changelog = "https://github.com/pnpm/pnpm/releases/tag/v${version}";
      license = lib.licenses.mit;
      sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
      platforms = lib.attrNames targets;
      mainProgram = "pnpm";
    };
  };
in
{
  inherit pnpm_12;
  pnpm = pnpm_12;
}
