import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";

export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="pt-16 sm:pt-20 min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-6xl font-bold bg-gradient-to-r from-accent-pink to-accent-purple bg-clip-text text-transparent mb-4">
            404
          </p>
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            Page not found
          </h1>
          <p className="text-text-secondary text-base mb-8">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="flex gap-4 justify-center">
            <a
              href="/"
              className="bg-accent-purple text-white font-semibold rounded-full px-6 py-2.5 text-sm hover:bg-accent-pink transition-all duration-200"
            >
              Go home
            </a>
            <a
              href="/docs"
              className="bg-bg-card border border-border-card text-text-secondary font-semibold rounded-full px-6 py-2.5 text-sm hover:text-text-primary hover:border-accent-purple/30 transition-all duration-200"
            >
              Read docs
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
