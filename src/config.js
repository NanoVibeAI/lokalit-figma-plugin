const isDev = process.env.NODE_ENV !== "production";
export const config = {
    BASE_API_URL: isDev
        ? "http://localhost:3001"
        : "https://lokalit.nanovibe.org",
    SUPABASE_URL: "https://pjwvbgauwgyqkwuhzarf.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_LXZ78n_YM6KMymcUL_iWWg_d48cVTWM",
    FIGMA_CLIENT_ID: "57f90d26-5567-4874-a457-a6eddede6e2e",
    get CALLBACK_URL() {
        return `${this.BASE_API_URL}/api/auth/callback/figma`;
    },
    get POLL_URL() {
        return `${this.BASE_API_URL}/api/auth/figma/code`;
    },
};
