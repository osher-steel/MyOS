import LoginView from "./LoginView";

export default function Login() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="masthead">Personal OS</h1>
      <LoginView />
    </main>
  );
}
