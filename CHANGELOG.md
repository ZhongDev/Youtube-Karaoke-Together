# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2024-01-15 - YouTube API Compliance & Legal

### Added - YouTube API Compliance

- **New Homepage/Landing Page** with Terms of Service modal
- **Comprehensive Privacy Policy** addressing all YouTube API requirements
- **Terms of Service** explicitly binding users to YouTube ToS
- **Contact Page** with multiple contact methods
- **ToS Confirmation Modal** with "Accept", "Don't ask again", and "Decline" options
- **YouTube API Notices** displayed prominently throughout the application
- **Legal compliance notifications** in all components using YouTube API Services

### Legal & Compliance

- ✅ Fixed: API Clients now state users agree to YouTube Terms of Service (III.A.1)
- ✅ Fixed: Added comprehensive Privacy Policy (III.A.2a)
- ✅ Fixed: Privacy Policy references Google Privacy Policy (III.A.2b)
- ✅ Fixed: Privacy Policy explains YouTube API Services usage (III.A.2c)
- ✅ Fixed: Privacy Policy details user information access/collection/storage (III.A.2d)
- ✅ Fixed: Privacy Policy explains information processing and sharing (III.A.2e)
- ✅ Fixed: Privacy Policy discloses cookie/device information collection (III.A.2g)
- ✅ Fixed: Added comprehensive contact information (III.A.2i)

## [1.1.0] - 2024-01-15 - Bug Fixes and Improvements

### Added

- Rate limiting middleware to prevent API abuse (10 requests per minute for room creation)
- Custom React hook `useSocket` for consistent socket connection management
- Error boundary component for graceful error handling
- Environment variables example file (`.env.example`)
- Better error messages and user feedback
- Proper request header handling for QR code generation

### Fixed

- **Critical**: Fixed multiple socket instance creation across components
- **Critical**: Fixed QR code generation to work with proxy servers and custom domains
- **Critical**: Added fallback configuration when config files are missing
- Fixed missing environment variables validation
- Fixed incomplete README instructions regarding API key setup
- Improved error handling in API calls with proper HTTP status checking

### Changed

- Enhanced server configuration loading with better error handling
- Improved QR code generation to use request headers for proper URL construction
- Better logging with environment information
- Socket connection now includes reconnection logic and timeout handling

### Security

- Added rate limiting to prevent abuse
- Improved request validation and error handling
- Added proper proxy trust configuration

### Performance

- Single socket instance shared across components reduces connection overhead
- Better memory management with proper event listener cleanup
- Optimized room cleanup process

## [1.0.0] - Initial Release

### Added

- Basic YouTube Karaoke Together functionality
- Room creation and management
- Real-time video queue synchronization
- Mobile-friendly control interface
- QR code generation for easy mobile access
- YouTube video search integration
