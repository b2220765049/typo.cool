# Typo – Website (GitHub Pages)

This folder contains a minimal static site for Typo’s public pages (landing + legal). It uses your app brand colors and local fonts.

## Structure

- `index.html` – Landing page
- `privacy.html` – Gizlilik Politikası
- `kvkk.html` – KVKK Aydınlatma Metni
- `consent.html` – Açık Rıza Metni
- `terms.html` – Hizmet Koşulları
- `delete-account.html` – Hesap Silme rehberi
- `data-retention.html` – Veri Saklama & İmha Politikası
- `data-request.html` – KVKK başvuru/DSR formu
- `site.css` – Shared styles (uses Lora + Montserrat and brand colors)

## Publish on GitHub Pages

1. Push these files to your repository main branch.
2. In GitHub → Settings → Pages:
   - Source: Deploy from a branch
   - Branch: `main` and folder: `/root` (the website folder is inside the repo; Pages can still serve it if you move/copy to `/docs`)

### Option A – Serve from repo root
Copy the `website` contents to the repository root or to `/docs` and point Pages to that folder.

### Option B – Keep in `website/` and use Pages from root
If you want Pages to serve the whole repo root, ensure links are `website/*.html` or move these files later.

## Custom domain (optional)
- Buy a domain (e.g., `typoapp.co`)
- In GitHub Pages, set the custom domain.
- Add DNS records at your registrar: `CNAME` to `<username>.github.io`.

## Notes
- Images are referenced relatively from `../assets/...` which exist in the app repo. If you split this site into a separate repo, also copy `assets/`.
- Background color matches app light background (hsl(37,37%,96%)). Primary is terracotta (hsl(13,39%,52%)).
- Headings use Lora; body uses Montserrat via local font files.
