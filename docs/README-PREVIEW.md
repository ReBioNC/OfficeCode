# Updating README images

The main README uses `docs/assets/studio-preview.png` as its preview image.

## Add or replace an image

1. Open the dashboard from `/dashboard` in OpenCode. Start the sessions you want to show and capture a screenshot while the agents are active. The included preview was captured at 1600 × 900 pixels.
2. Save the PNG under `docs/assets/`. Replace `studio-preview.png` to update the existing preview, or use a new name such as `studio-planning.png` for another image.
3. Add this Markdown to the root `README.md`:

   ```markdown
   ![OfficeCode studio with Frontend, Backend, and QA agents](docs/assets/studio-preview.png)
   ```

   The text in square brackets is the image description. The path in parentheses is relative to `README.md`. Use forward slashes and match the file name's capitalization exactly.

4. Stage and commit the image together with any README changes:

   ```bash
   git add docs/assets/studio-preview.png README.md
   git commit -m "Update studio preview"
   git push
   ```

5. Open the same branch on GitHub and check the rendered README. To show the preview on the repository landing page, the files must also be present on its default branch.

If you replace an image at the same path, the Markdown does not need to change. If you use a new file name, update the Markdown path and the `git add` command accordingly.

## Add a second preview

```markdown
### Planning together

![OpenCode agents planning at the meeting table](docs/assets/studio-planning.png)
```

The second PNG must also be committed. A local Windows path such as `C:\Users\...` cannot display an image for people browsing the repository on GitHub.

Before committing a public preview, check that task titles, bubbles, and activity history contain only information you intend to publish. Use an isolated workspace for sample tasks.

GitHub supports relative image paths on the current branch. See [GitHub's README documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes#relative-links-and-image-paths-in-markdown-files).
