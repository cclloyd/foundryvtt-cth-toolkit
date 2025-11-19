# Casual Try-Hards Toolkit for FoundryVTT

This is a module for FoundryVTT that does various tweaks and macros useful for running our game. Open sourced so that
others may use it. Most functions of this module are able to be enabled/disabled in the settings.

# Features:

- All apps and API exposed through `game.cth`.

# Installation

Install through the FoundryVTT admin interface.

Manifest URL:

- **Latest:** https://gitlab.com/api/v4/projects/29080072/packages/generic/permalink/latest/module.json
- **Specific Version:** https://gitlab.com/api/v4/projects/29080072/packages/generic/permalink/v1.x.x/module.json

# Development

- Clone the repository
- Run `yarn install`
- To build:
    - Run `yarn build`
- To develop:
    - Create a folder named `dist` in the project root.
    - Create a symlink/shortcut from the `dist` folder to your foundry's module directory and name the linked folder
      `cth-toolkit`
        - Windows default: `%LocalAppData%\FoundryVTT\Data\modules`
        - Linux default: `~/.local/share/FoundryVTT/Data/modules`
        - Recommended: develop in a docker container, mount the `dist` volume to the above destination
    - Run `yarn watch` (this will watch the src directory for changes and automatically rebuild changes live)
    - Launch Foundry

## Prerequisites

In order to build this module, recent versions of `node` (>= 24) and `yarn/npm` are
required. If you don't have `yarn`, but have `npm`, just run `npm install -g yarn` to install `yarn`.
