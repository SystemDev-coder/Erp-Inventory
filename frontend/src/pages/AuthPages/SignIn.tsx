import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Sign In | KeydMaal ERP"
        description="Sign in to your KeydMaal ERP account."
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
