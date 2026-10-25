# OmniMedia Downloader 🚀

All-in-one high-speed social media video & audio downloader for YouTube, Facebook, Instagram, Pinterest, Twitter/X, TikTok, Reddit, Vimeo, SoundCloud, and more.

Developed by [nasir369](https://nasir369.vercel.app/).

---

## ⚡ How to Deploy on Vercel (ভ্যারসেলে হোস্ট করার সহজ নিয়ম)

### Option 1: Deploy via GitHub (সবচেয়ে সহজ ও অটোমেটিক)

1. এই কোডগুলো আপনার GitHub অ্যাকাউন্টে একটি নতুন রিপোজিটোরিতে পুশ (Push) করুন:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of OmniMedia Downloader"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

2. [vercel.com](https://vercel.com/) এ লগইন করুন।
3. **"Add New..."** -> **"Project"** এ ক্লিক করুন।
4. আপনার GitHub রিপোজিটরিটি সিলেক্ট করে **"Import"** এ ক্লিক করুন।
5. Vercel স্বয়ংক্রিয়ভাবে সব সেটিংস শনাক্ত করবে:
   - **Framework Preset**: `Vite`
   - **Install Command**: `npm install --legacy-peer-deps` (কনফিগার করা আছে)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
6. শুধু **"Deploy"** বাটনে চাপ দিন! ১ মিনিটের মধ্যে আপনার সাইট লাইভ হয়ে যাবে।

---

### Option 2: Deploy using Vercel CLI (টার্মিনাল দিয়ে)

যদি আপনার কম্পিউটারে Vercel CLI ইনস্টল করা থাকে:
```bash
npm install -g vercel
vercel
```
টার্মিনালের নির্দেশনা অনুসরণ করে `Y` চাপলে সরাসরি ডিপ্লয় হয়ে যাবে। প্রোডাকশনের জন্য:
```bash
vercel --prod
```

---

## 🛠 Local Development

```bash
# ডিপেনডেন্সি ইনস্টল করুন
npm install

# লোকাল ডেভ সার্ভার রান করুন (Port 3000)
npm run dev

# প্রোডাকশন বিল্ড তৈরি করুন
npm run build
```
# video_downloader
