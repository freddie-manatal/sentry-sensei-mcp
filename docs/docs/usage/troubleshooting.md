# Troubleshooting

## Common Issues

### Environment Variables Not Found
- Make sure all required environment variables are set
- Restart Claude Desktop after setting environment variables
- Check that variable names match exactly (case-sensitive)

### Authentication Errors
- Verify your Sentry and JIRA tokens are valid
- Check that your organization/domain names are correct
- Ensure tokens have the required permissions

### Connection Issues
- Verify the server is running on the correct port
- Check firewall settings
- Ensure the MCP server URL is accessible

### Server Not Starting
- Check if port 3000 is already in use
- Verify all dependencies are installed (`npm install`)
- Check the server logs for specific error messages

## Getting Help

If you encounter issues not covered here:
1. Check the server logs for detailed error messages
2. Verify your configuration matches the examples in the README
3. Test your API credentials directly with curl commands 