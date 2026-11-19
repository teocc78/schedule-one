# Prompt: get a UCSB API key with a browser agent

Paste this into Claude in Chrome (or any browser agent) while signed in to Chrome. You do the sign-in yourself; the agent never types your password or Duo code.

---

Help me get a UCSB Developer API key for a student demo app. Work only on developer.ucsb.edu.

1. Open https://developer.ucsb.edu and click "Login" (upper right). If it offers "Log in with UCSBNet id", choose that. Stop and let me sign in myself, including Duo. Never type my password or a Duo code. If there's no NetID option and I don't have an account, stop and tell me; I'll click "Register" myself.
2. After I'm signed in, open "My Apps" (it may just say "Apps") and click "Add a new App" (or "Add app").
3. Name: "Schedule One Demo". If it asks for a Reference URL, use https://schedule-one-i3j5.vercel.app.
4. Under APIs, tick only "Academic Curriculums" (and "Academic Quarter Calendar" if it's listed). Don't tick anything that needs approval, and don't request extra access.
5. Click "Create App" (or "Add app") at the bottom.
6. Open the new app, go to its "Keys" tab, and click "Show key" if the key is hidden. The value I need is the **Consumer Key**. Ignore the Consumer Secret; this API doesn't use it.
7. Show me the Consumer Key on screen and tell me whether Academic Curriculums shows "Approved" or "Pending". If the key has a line through it, it isn't approved yet; tell me that.
8. Don't paste the key anywhere else, don't email it, and don't change any other settings. Stop there.

---

Then put the key in Vercel yourself: Project Settings > Environment Variables, name `UCSB_API_KEY`, value = the Consumer Key, then redeploy. `/api/health` shows `"ucsbKeySet": true` once it's in. The app sends it in the `ucsb-api-key` header.
