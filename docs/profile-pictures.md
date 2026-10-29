# Profile and store pictures

Accounts and stores can optionally upload a profile picture. Use **Akun → Profil** for a buyer account, **Akun → Data login** in the partner/admin workspace, or **Profil toko → Identitas** for a store. Both forms preview the selected picture and support replacing or removing it. Store pictures appear on public store profiles; account pictures appear in buyer and workspace account avatars. Missing or unavailable pictures fall back to initials.

The API accepts `profile_picture` as a multipart file on `PATCH /api/auth/me` and store creation/update endpoints. Omit the field to preserve the current picture; send an empty string or JSON `null` to remove it. Responses include the picture URL or `null`. Store summaries also expose the picture URL.

Uploads must be static JPEG, PNG, or WebP, at most 5 MiB and 20 megapixels. The backend applies EXIF orientation, resizes to fit 1024×1024, and re-encodes as JPEG with a random filename to discard metadata. Images use the existing `MEDIA_ROOT` storage and `/media/` serving/proxy configuration. Replacing or removing a picture clears its database reference; previous files remain in storage.

Apply the schema migration before starting the updated app:

```sh
cd backend
.venv/bin/python manage.py migrate
```
