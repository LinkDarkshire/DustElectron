# Dust Game Manager
## Project Documentation

![Dust Logo](placeholder-for-logo)

**Version:** 0.0.1 (Pre-release)  
**Author:** Florian Heyer  
**Last Updated:** May 5, 2025

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Project Goals and Objectives](#2-project-goals-and-objectives)
3. [Target Audience](#3-target-audience)
4. [System Architecture](#4-system-architecture)
5. [Feature Specifications](#5-feature-specifications)
6. [Development Roadmap](#6-development-roadmap)
7. [Technical Requirements](#7-technical-requirements)
8. [User Interface Design](#8-user-interface-design)
9. [Data Management](#9-data-management)
10. [Distribution Strategy](#10-distribution-strategy)
11. [Future Considerations](#11-future-considerations)
12. [Appendix: Code Structure](#12-appendix-code-structure)

---

## 1. Project Overview

Dust Game Manager is a universal game management application designed to provide users with a centralized platform for organizing, launching, and exploring their game libraries across multiple distribution platforms. Unlike platform-specific launchers that limit functionality to games from a single source, Dust Game Manager integrates multiple gaming platforms into a unified interface, enhancing the user experience by eliminating the need to switch between different launchers.

The application is built using Electron, enabling cross-platform compatibility while maintaining the performance and user experience of a native desktop application. This architectural choice allows for seamless integration with various operating systems and provides a consistent user experience regardless of platform.

Dust Game Manager aims to solve common problems faced by gamers who own titles across multiple platforms by providing:

- A unified game library interface
- Detailed game information retrieval from various sources
- Efficient game organization with filtering and search capabilities
- Direct game launching without switching between different launchers
- Integration with multiple gaming platforms including DLSite, Steam, and Itch.io

The project will be released to the public free of charge, with a focus on continuous improvement and expansion of supported platforms over time.

---

## 2. Project Goals and Objectives

### Primary Goals

1. **Unified Game Library Management**: Create a single application that can manage games from multiple platforms.
2. **Enhanced Game Organization**: Provide tools for organizing games by tags, genres, and other metadata.
3. **Simplified Game Access**: Enable users to launch games directly from the application.
4. **Rich Game Information**: Automatically fetch and display detailed information about games from their respective platforms.
5. **User-Friendly Interface**: Deliver an intuitive and responsive UI that simplifies navigation and game management.

### Secondary Objectives

1. **Cross-Platform Support**: Ensure the application functions properly on multiple operating systems.
2. **Offline Functionality**: Allow basic functionality without requiring an internet connection.
3. **Extensible Architecture**: Design the system to easily accommodate additional platforms in the future.
4. **Low Resource Usage**: Minimize system resources required for operation.
5. **Standalone Installation**: Enable end-users to run the application without requiring additional dependencies.

### Success Metrics

The success of the Dust Game Manager project will be measured by:

1. The number of supported game platforms
2. Application performance and stability
3. User feedback on interface usability
4. Feature completeness compared to platform roadmap

---

## 3. Target Audience

Dust Game Manager is designed for:

- **Gamers with diverse libraries**: Users who own games across multiple platforms and want a unified management solution.
- **Indie game enthusiasts**: Players who frequently purchase games from platforms like Itch.io and DLSite.
- **Organization-focused users**: People who want better tools to organize and categorize their game collections.
- **General PC gamers**: Anyone looking for an alternative to managing multiple platform-specific launchers.

The application will be provided free of charge to the public, making it accessible to all users regardless of budget constraints. The distribution model focuses on providing value to the gaming community without financial barriers.

### User Personas

#### Persona 1: Casual Multi-Platform Gamer
- **Name**: Alex
- **Age**: 25-35
- **Behavior**: Owns games on Steam, Itch.io, and other platforms, but doesn't want to deal with multiple launchers
- **Pain Points**: Difficulty remembering which games are on which platform; time wasted switching between launchers
- **Goals**: Quick access to all games; simple organization system

#### Persona 2: Visual Novel Enthusiast
- **Name**: Jordan
- **Age**: 20-30
- **Behavior**: Collects visual novels and indie games from DLSite and specialized platforms
- **Pain Points**: Limited metadata and organization options on original platforms; difficulty tracking large collection
- **Goals**: Detailed game information; advanced filtering options; privacy when playing niche titles

#### Persona 3: Game Collector
- **Name**: Sam
- **Age**: 30-45
- **Behavior**: Has an extensive collection across many platforms gathered over years
- **Pain Points**: Hard to remember what games they own; disorganized library spread across platforms
- **Goals**: Complete library visibility; advanced categorization; detailed metadata for all games

---

## 4. System Architecture

Dust Game Manager employs a modular architecture built on Electron, allowing it to run as a desktop application while leveraging web technologies for the user interface. The architecture is designed for extensibility, making it easy to add support for additional gaming platforms over time.

### Technology Stack

- **Framework**: Electron (v33.2.0)
- **Frontend**: HTML5, CSS3, JavaScript
- **Backend**: Node.js
- **Data Storage**: Local JSON files for configuration and game data
- **External APIs**: Integration with platform-specific APIs (DLSite, Steam, Itch.io)
- **Package Management**: npm

### Core Components

#### Main Process (Node.js)
- **Main Entry Point**: `main.js`
- **Window Management**: `window-manager.js`
- **IPC Handlers**: `ipc-handlers.js`
- **File System Operations**: `file-manager.js`
- **Game Management**: `game-manager.js`
- **Platform-Specific Logic**: `platform-manager.js`

#### Renderer Process (Frontend)
- **UI Layer**: `index.html`, `styles.css`
- **Application Logic**: `renderer.js`
- **Component State Management**: Built into the `DustApp` class

#### Platform Integrations
- **DLSite API Client**: `dlsite-api.js`
- **Steam API Client**: (Planned)
- **Itch.io API Client**: (Planned)

### Data Flow

1. The application initializes the main process, which creates the application window.
2. Communication between the main process and renderer process occurs via Electron's IPC system.
3. Game data is stored locally in the user's application data directory.
4. When launched, the application scans for installed games and loads metadata from local storage.
5. Additional information is fetched from platform APIs when needed.
6. Game launch commands are executed through the main process.

### Directory Structure

```
dust-game-manager/
├── assets/           # Application assets (images, icons)
├── config/           # Configuration files
├── modules/          # Core functionality modules
├── platforms/        # Platform-specific API clients
├── index.html        # Main application view
├── main.js           # Application entry point
├── package.json      # Project dependencies
├── renderer.js       # Frontend application logic
└── styles.css        # Application styling
```

---

## 5. Feature Specifications

### Core Features

#### Game Library Management

**Description**: Central game library displaying all games across supported platforms.

**Functionality**:
- View all games in a unified interface
- Display game covers, titles, developers, and basic metadata
- Toggle between grid and list views
- Filter games by platform, genre, and tags
- Search games by title, developer, or description

**Implementation Details**:
- Game data stored locally in JSON format
- Cover images cached locally
- Automatic library scanning

#### Game Information Display

**Description**: Detailed game information panel showing comprehensive metadata.

**Functionality**:
- Display game title, developer, publisher, genre, and release date
- Show game description
- List voice actors, authors, illustrators (when available)
- Display tags and categorizations
- Link to original store page

**Implementation Details**:
- Information sourced from platform APIs
- Side panel UI for viewing details
- Local storage of fetched metadata

#### Game Launching

**Description**: Direct launching of games from within the application.

**Functionality**:
- Launch games with a single click
- Track play time
- Record last played date
- Support for various executable types across operating systems

**Implementation Details**:
- Child process spawning for executable launching
- Play time tracking based on application focus
- Support for custom launch options (planned)

#### Platform Integrations

**Description**: Integration with various game distribution platforms.

**Functionality**:
- DLSite integration (initial focus)
- Steam integration (planned)
- Itch.io integration (planned)
- Additional platforms (future)

**Implementation Details**:
- Platform-specific API clients
- Authentication handling for platforms requiring login
- Metadata parsing and normalization

#### Game Importing

**Description**: Tools for importing games into the library.

**Functionality**:
- Single game import
- Bulk folder import
- Automatic platform detection
- Manual metadata editing

**Implementation Details**:
- Directory scanning algorithms
- Platform identification heuristics
- Metadata extraction from game files and directories

### Additional Features

#### Settings and Preferences

**Description**: User configuration options for the application.

**Functionality**:
- Theme selection (dark/light)
- Startup options
- Game folder management
- Application behavior settings

**Implementation Details**:
- Settings stored in local configuration file
- UI for adjusting preferences
- Real-time application of setting changes

#### Game Organization

**Description**: Tools for organizing the game library.

**Functionality**:
- Custom tags
- Favorites marking
- Collection creation
- Sorting options

**Implementation Details**:
- User-defined metadata storage
- UI elements for organization features
- Persistent organization across sessions

---

## 6. Development Roadmap

The development of Dust Game Manager follows a milestone-based approach, focusing on incremental addition of platform support and feature enhancements. Instead of rigid time constraints, the development follows the philosophy of "it's ready when it's ready," ensuring quality and stability at each release.

### Milestone Overview

#### Version 0.1.0: DLSite Maniax Support
- Initial application framework
- Basic UI implementation
- Core game management functionality
- DLSite Maniax integration
- Game launching capability
- Basic search and filtering

#### Version 0.2.0: Complete DLSite Support
- Add support for remaining DLSite categories
- Enhanced metadata display
- Improved game detection
- UI refinements
- Performance optimizations

#### Version 0.3.0: Steam Integration
- Steam platform integration
- Steam library detection
- Steam metadata fetching
- Unified game view across DLSite and Steam
- Enhanced filtering capabilities

#### Version 0.4.0: Itch.io Support
- Itch.io platform integration
- Indie game support
- Handling of browser-playable games
- Metadata enrichment from multiple sources

#### Future Milestones (Tentative)
- Additional platform integrations
- Advanced game organization features
- Cloud sync capabilities
- Community features
- Potential server version for indie developer distribution platform

### Feature Development Timeline

While there is no fixed timeline for feature completion, the general development sequence will follow this pattern:

1. Core framework and infrastructure
2. Basic game management functionality
3. Platform-specific integrations (one per milestone)
4. UI and UX enhancements
5. Performance optimizations
6. Advanced features and capabilities

Each feature will undergo development, testing, and refinement before being included in a release version.

---

## 7. Technical Requirements

### Minimum System Requirements

- **Operating System**: Windows 10/11, macOS 10.15+, or Linux (major distributions)
- **Processor**: Dual-core CPU @ 2.0 GHz
- **Memory**: 4 GB RAM
- **Storage**: 500 MB available space + space for game metadata
- **Display**: 1280x720 resolution
- **Internet Connection**: Required for metadata fetching

### Development Environment

- **Node.js**: v14.0.0 or higher
- **npm**: v6.0.0 or higher
- **Electron**: v33.2.0
- **Development IDE**: Any (VSCode recommended)

### Dependencies

Major dependencies include:
- **electron**: Core framework
- **node-fetch**: Network requests
- **cheerio**: HTML parsing for web scraping
- **lowdb**: Local database functionality
- **chart.js**: Data visualization (for statistics views)
- **@fortawesome/fontawesome-free**: Icons and visual elements

### Distribution Requirements

The application will be distributed as a standalone executable for Windows, macOS, and Linux, eliminating the need for users to install Node.js or other dependencies. The distribution will be packaged using Electron-builder.

### Testing Requirements

- Unit testing for core functionality
- Integration testing for platform interactions
- Cross-platform testing to ensure compatibility
- Performance testing to ensure responsiveness

---

## 8. User Interface Design

Dust Game Manager features a clean, modern interface designed for usability and efficiency. The UI follows a dark theme by default (with light theme option) to provide a gaming-friendly aesthetic.

### Layout Structure

- **Sidebar**: Navigation between main application sections
- **Toolbar**: Search, filtering, and view options
- **Main Content Area**: Game grid/list display
- **Detail Panel**: Slide-in panel for detailed game information

### Key UI Components

#### Main Navigation
- Library (game collection)
- Shop (future feature for game discovery)
- Community (future feature)
- Settings

#### Game Display Modes
- Grid View: Visual display focusing on game covers
- List View: Compact display with more textual information

#### Game Cards
- Cover image
- Title
- Developer
- Genre
- Last played information
- Play time statistics
- Quick-access play button
- Info button for details

#### Game Details Panel
- Large cover image
- Comprehensive game information
- Action buttons (Play, Edit)
- Metadata sections (tags, voice actors, etc.)
- Store link

#### Modals and Dialogs
- Game addition wizard
- Settings panels
- Confirmation dialogs
- Notification system

### UI Design Principles

1. **Visual Hierarchy**: Important actions and information are visually emphasized
2. **Consistency**: Similar actions and elements maintain consistent styling
3. **Feedback**: Clear visual feedback for user actions
4. **Efficiency**: Minimize clicks required for common actions
5. **Adaptability**: Responsive design that adapts to window size

### Color Palette

- **Primary Color**: Blue (#66c0f4)
- **Background**: Dark blue-grey (#1b2838)
- **Text**: White (#ffffff) and light grey (#c7d5e0)
- **Accent Colors**: Success green (#2ecc71), Error red (#e74c3c)

### Typography

- Sans-serif font family for readability
- Size hierarchy for different information levels
- Consistent text styling throughout the application

---

## 9. Data Management

Dust Game Manager employs a local data storage approach, keeping game information and user preferences on the user's system for privacy and performance.

### Data Storage

- **User Data Location**: Application-specific directory in the user's profile
- **Game Metadata**: JSON files storing information about each game
- **Configuration**: Application settings stored in config files
- **Assets**: Game covers and other media stored locally

### Data Structure

#### Game Information (dustgrain.json)
```json
{
  "internalId": 1,
  "title": "Game Title",
  "executable": "game.exe",
  "executablePath": "C:/Games/ExampleGame",
  "version": "1.0",
  "genre": "Visual Novel",
  "releaseDate": "2024-01-01",
  "developer": "Example Studio",
  "publisher": "Example Publisher",
  "description": "Game description text",
  "source": "DLSite",
  "tags": ["tag1", "tag2"],
  "coverImage": "path/to/cover.jpg",
  "screenshots": ["path/to/screenshot1.jpg"],
  "lastPlayed": "2025-05-01T12:00:00Z",
  "playTime": 120,
  "installed": true,
  "installDate": "2025-04-15T00:00:00Z",
  "dlsiteId": "RJ123456",
  "dustVersion": "1.0"
}
```

#### Application Configuration
```json
{
  "theme": "dark",
  "startAtLogin": false,
  "closeToTray": true,
  "gameDirectories": [
    "C:/Games/Steam",
    "D:/Games/DLSite"
  ]
}
```

### Data Operations

#### Reading Game Data
1. Application scans configured game directories
2. Each game directory is checked for a dustgrain.json file
3. Game information is loaded into memory

#### Writing Game Data
1. New game information is stored in a dustgrain.json file
2. Game data updates are written back to the file
3. File system operations include error handling and atomic writes

#### Data Migration
The application includes versioning for data structures to support future migrations as the application evolves.

### Platform Data Integration

#### DLSite
- Information extracted from DLSite's product pages and APIs
- RJ/RE numbers used as unique identifiers
- Metadata includes circle, voice actors, tags, and other DLSite-specific information

#### Steam (Planned)
- Integration with Steam API
- AppID used as unique identifier
- Local Steam installation detection

#### Itch.io (Planned)
- Integration with Itch.io API
- URL or ID-based identification
- Support for browser-launched games

### Privacy Considerations

- All data stored locally on the user's system
- No user data sent to external servers without explicit consent
- Platform authentication handled securely when required

---

## 10. Distribution Strategy

Dust Game Manager will be distributed as a free application to the public, with a focus on easy installation and accessibility.

### Distribution Channels

- **Project Website**: Primary distribution point
- **GitHub Releases**: Alternative download location (if decided to make it public)
- **Direct Download**: Standalone installers for each supported platform

### Packaging

- **Windows**: Executable installer (.exe)
- **macOS**: Disk image (.dmg) or application bundle (.app)
- **Linux**: AppImage, .deb, and .rpm packages

### Installation Process

1. User downloads the appropriate package for their platform
2. Installation wizard guides through basic setup
3. First-run experience includes configuration of game directories
4. No additional dependencies required for end users

### Update Mechanism

- **In-App Updates**: Notification and download of updates from within the application
- **Manual Updates**: Option to download and install new versions manually
- **Update Frequency**: Based on milestone completion rather than fixed schedule

### License and Terms

- **Free for Personal Use**: The application is provided at no cost
- **Proprietary Software**: Source code is not publicly available
- **Terms of Use**: Clear terms provided regarding application usage

---

## 11. Future Considerations

While the initial roadmap focuses on specific platforms and core functionality, several future enhancements and expansions are under consideration for later development phases.

### Potential Future Features

#### Game Store Integration
- Integration with store APIs to discover and potentially purchase games
- Wishlist management across platforms
- Price tracking and sale notifications

#### Server Version
- Development of a server edition for indie developers
- Platform for indie developers to distribute games
- Community features for players and developers
- Revenue model to sustain server infrastructure

#### Enhanced Community Features
- Friend lists and activity tracking
- Game recommendations based on library
- Community tags and reviews
- Achievement tracking across platforms

#### Advanced Organization
- Custom collections and smart folders
- Tagging system with hierarchies
- Game completion tracking
- Playing status management

#### Platform Expansion
- Additional gaming platforms beyond the initial roadmap
- Browser game support
- Mobile game library integration
- Console game cataloging

### Technical Evolution

- **Performance Optimization**: Continued focus on application responsiveness
- **Plugin Architecture**: Potential for community-developed extensions
- **Cloud Integration**: Optional cloud backup of library metadata
- **Advanced Statistics**: Deeper insights into gaming habits and collections

### Business Considerations

While Dust Game Manager will remain free for personal use, potential future business models to sustain development might include:

- **Donation/Tip System**: Optional financial support from users
- **Premium Features**: Advanced features for a small fee
- **Developer Tools**: Paid tools for game developers using the server platform

These future considerations will be evaluated based on user feedback, technical feasibility, and alignment with the project's core mission of providing a free, high-quality game management solution.

---

## 12. Appendix: Code Structure

### File Organization

```
dust-game-manager/
├── assets/                 # Application assets
│   ├── games/              # Game covers and screenshots
│   └── platforms/          # Platform icons and branding
├── config/                 # Configuration files
│   └── app-config.js       # Application configuration
├── modules/                # Core functionality modules
│   ├── file-manager.js     # File system operations
│   ├── game-manager.js     # Game management logic
│   ├── ipc-handlers.js     # IPC communication handlers
│   ├── platform-manager.js # Platform integration management
│   └── window-manager.js   # Electron window management
├── platforms/              # Platform-specific API clients
│   ├── dlsite-api.js       # DLSite integration
│   ├── steam-api.js        # (Planned) Steam integration
│   └── itchio-api.js       # (Planned) Itch.io integration
├── index.html              # Main application view
├── main.js                 # Application entry point
├── package.json            # Project dependencies
├── renderer.js             # Frontend application logic
└── styles.css              # Application styling
```

### Key Class Descriptions

#### DustApp (renderer.js)
The main application class that handles UI interaction, game display, and user actions.

**Responsibilities**:
- Initialize the user interface
- Handle user interactions
- Manage game display and filtering
- Communicate with the backend via IPC

**Key Methods**:
- `initEventListeners()`: Sets up event handlers for UI elements
- `loadGames()`: Loads game data from the backend
- `renderGames()`: Displays games in the UI
- `showGameDetails()`: Displays detailed information for a selected game
- `launchGame()`: Initiates game launching process

#### DLSiteClient (dlsite-api.js)
Client for interacting with DLSite's web interface and APIs.

**Responsibilities**:
- Fetch game information from DLSite
- Parse HTML and JSON responses
- Download and manage cover images
- Extract DLSite IDs from paths

**Key Methods**:
- `getGameInfo()`: Retrieves comprehensive game information
- `getProductInfo()`: Fetches basic product information
- `getWorkDetails()`: Retrieves detailed work information
- `downloadImage()`: Downloads and stores game cover images

#### Game Manager (game-manager.js)
Backend module for managing game data and operations.

**Responsibilities**:
- Scan for installed games
- Manage game metadata
- Handle game launching
- Process game addition and removal

**Key Methods**:
- `scanGames()`: Detects installed games
- `addGameWithPath()`: Adds a game with a specific path
- `updateGame()`: Updates game information
- `launchGame()`: Launches a game executable
- `deleteGame()`: Removes a game from the library

### Communication Flow

1. **User Interaction**: User interacts with the UI (renderer.js)
2. **IPC Request**: Renderer process sends request via IPC
3. **Handler Processing**: ipc-handlers.js routes request to appropriate module
4. **Business Logic**: Module processes request (e.g., game-manager.js)
5. **External Integration**: If needed, platform-specific clients are invoked
6. **File Operations**: File system changes are handled by file-manager.js
7. **Response**: Result is sent back through IPC
8. **UI Update**: Renderer updates the UI based on the response

This modular architecture enables clean separation of concerns and facilitates future expansion of the application's capabilities.

---

© 2025 Florian Heyer. All Rights Reserved.
