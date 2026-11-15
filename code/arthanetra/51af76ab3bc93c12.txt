# Arthaton 2026 submission checklist

Key dates from arthaton.com (confirm on the site): registration closes **15 November 2026**, submissions close
**22 November 2026 at 11:59 PM IST**, and late entries are not accepted. Teams are 1 to 3 students currently enrolled
in an Indian college. Entries without a GitHub repository or a demo video are not judged. Open-source libraries and AI
APIs are allowed if they are credited in the README (already done in the Credits section).

## Before you submit

- [ ] Register the team on arthaton.com before 15 November
- [ ] Read the official rules for anything about IP or repository visibility
- [ ] If you want a patent, file the provisional application before the repository and video become public (see `docs/IPR.md`, section 8)
- [ ] Add team names and college to `docs/IPR.md` section 9
- [ ] Get a free Groq key at console.groq.com and put it in `.env` (this file is never committed)

## Upload to GitHub

Use the PowerShell command we shared. It unzips the project and schedules the upload for the time you choose. Or do
it by hand:

```bash
cd arthanetra
git init
git add .
git commit -m "ArthaNetra: see the real price of any loan, EMI or insurance offer"
git branch -M main
git remote add origin https://github.com/<your-username>/arthanetra.git
git push -u origin main
```

GitHub Actions runs the 89 tests on every push.

## Live link (optional, but it helps)

1. On render.com choose New, then Blueprint, and pick the repository (it reads `render.yaml`)
2. Add the `GROQ_API_KEY` environment variable and deploy
3. The free tier sleeps when idle, so open the link once before judging starts

## Demo video

- [ ] Follow `docs/DEMO_VIDEO_SCRIPT.md`, about 3 minutes
- [ ] Upload to YouTube as unlisted, or to Google Drive with link sharing on
- [ ] Put the video link at the top of README.md

## Final check

- [ ] `./run.sh` (or `run.bat`) works on a clean machine and the examples load
- [ ] `cd backend && python -m pytest -q` passes
- [ ] README has the video link and the live link
- [ ] Submit by 21 November to leave a day of buffer
