# AI Personal Assistant - Homebrew Tap

This is the official Homebrew tap for AI Personal Assistant.

## Installation

### Method 1: Install from local tap (for development/testing)

```bash
# Clone the tap repository
git clone https://github.com/fengkuangdeshitou/homebrew-ai-personal-assistant.git

# Add the local tap
brew tap fengkuangdeshitou/ai-personal-assistant file:///path/to/homebrew-ai-personal-assistant

# Install AI Personal Assistant
brew install --HEAD fengkuangdeshitou/ai-personal-assistant/ai
```

### Method 2: Install from GitHub tap (recommended for users)

```bash
# Add the tap
brew tap fengkuangdeshitou/ai-personal-assistant

# Install AI Personal Assistant
brew install ai
```

**Password Requirements**: This is a private repository. Installation requires a valid installation password. Contact the administrator to obtain the password.

After installation, complete the setup:

```bash
ai-install
```

Then use the following commands:

```bash
ai           # Start AI Assistant GUI
ai-install   # Reinstall AI Assistant
ai-uninstall # Uninstall AI Assistant
ai-help      # Show help information
ai-update    # Check for updates
```

## Development

### Testing the formula locally

```bash
# Test the formula
brew install --build-from-source ai.rb

# Or test with verbose output
brew install -v ai.rb
```

### Updating the formula

When updating the AI Personal Assistant:

1. Update the version in the formula
2. Update the SHA256 if using bottled version
3. Test the installation
4. Commit and push changes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see the [AI Personal Assistant](https://github.com/fengkuangdeshitou/ai-personal-assistant) repository for details.