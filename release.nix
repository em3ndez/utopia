{}:

let
  config = {
    allowUnfree = true;
  };

  pkgs = import (builtins.fetchTarball {
    name = "nixos-20.03";
    url = https://github.com/NixOS/nixpkgs/archive/20.03.tar.gz;
    # Hash obtained using `nix-prefetch-url --unpack <url>`
    sha256 = "0182ys095dfx02vl2a20j1hz92dx3mfgz2a6fhn31bqlp1wa8hlq";
  }) { inherit config; };
  
  haskell-lib = pkgs.haskell.lib;
  custom-cabal-plan = haskell-lib.addExtraLibraries (haskell-lib.appendConfigureFlag pkgs.haskellPackages.cabal-plan "-flicense-report") [pkgs.haskellPackages.zlib pkgs.haskellPackages.tar];
in
  { 
    pkgs = pkgs;
    custom-cabal-plan = custom-cabal-plan;
  }
