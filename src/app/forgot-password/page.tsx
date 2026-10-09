import { AuthForm } from "@/components/auth-form";
export default function Page() {
  return (
    <AuthForm
      mode="forgot"
      googleEnabled={Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
      )}
    />
  );
}
