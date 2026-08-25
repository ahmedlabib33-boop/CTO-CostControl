# Local setup

1. Extract the ZIP into the final local folder.
2. Open Command Prompt/PowerShell in that folder.
3. Run `npm install`.
4. Run `npm run test`.
5. Run `npm run validate:data`.
6. Run `npm run build`.
7. Run `npm run dev` and open `http://localhost:3000`.
8. Create `INPUT` if it does not already exist.
9. To test automatic detection without publishing, run `WATCH_ONCE_NO_PUBLISH.bat`.
10. After Git remote + Vercel are configured, use `START_WATCHER.bat` for automatic publish.

Raw workbooks are ignored by Git. Do not remove that rule unless you intentionally want source workbooks in repository history.
