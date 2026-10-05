import type { Backend } from "@/backend";
import { UserRole, createActor } from "@/backend";
import { createTestAwareActor, isTestSignInActive } from "@/lib/testIdentity";
import { useActor, useInternetIdentity } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";

/**
 * Registers the deterministic test principal with the backend exactly once.
 *
 * The test identity is a real Ed25519 principal the backend has never seen, so
 * any guarded read or write traps "User is not registered" until
 * `_initialize_access_control` has run for it. That call is idempotent (the
 * first caller becomes admin, later callers are no-ops), so memoizing the
 * in-flight promise is safe and lets every guarded call await the same
 * registration instead of racing it.
 *
 * Inert when the test-only path is not active, so the real Internet Identity
 * flow is untouched.
 */
let registrationPromise: Promise<void> | null = null;

export function ensureTestPrincipalRegistered(actor: Backend): Promise<void> {
  if (!isTestSignInActive()) return Promise.resolve();
  if (!registrationPromise) {
    registrationPromise = actor
      ._initialize_access_control()
      .then(() => undefined)
      .catch((error: unknown) => {
        // Allow a later attempt to retry after a transient failure.
        registrationPromise = null;
        throw error;
      });
  }
  return registrationPromise;
}

/**
 * Test-aware actor factory. With the test-only flag off this is the generated
 * `createActor` unchanged; with it on, the actor is built against the
 * deterministic test agent so a tester reaches the real backend without an
 * Internet Identity credential.
 *
 * Building the actor also kicks off test-principal registration eagerly, so the
 * deterministic caller is registered before the first guarded call regardless
 * of which hook created the actor. The registration is memoized and idempotent,
 * and `useUserRole` awaits the same promise before reading the caller's role.
 */
const testAwareFactory = createTestAwareActor(createActor);

export const actorFactory: typeof testAwareFactory = (
  canisterId,
  uploadFile,
  downloadFile,
  options,
) => {
  const actor = testAwareFactory(canisterId, uploadFile, downloadFile, options);
  void ensureTestPrincipalRegistered(actor).catch(() => {
    /* surfaced by the awaiting caller; eager kick-off is best-effort */
  });
  return actor;
};

/**
 * Shared actor accessor for the whole app.
 *
 * Always call this at the top level of a hook or component — never inside a
 * query/mutation callback. `actor` is null until the identity is resolved.
 */
export function useBackend() {
  const { actor, isFetching } = useActor(actorFactory);
  return {
    actor,
    isFetching,
    isReady: !!actor && !isFetching,
  };
}

/**
 * Resolves the signed-in caller's role from the backend.
 * Falls back to `guest` while loading or when unauthenticated.
 *
 * The test-only path signs in with a deterministic Ed25519 principal that the
 * backend has never seen, so `getCallerUserRole` would trap "User is not
 * registered". Registering that principal with `_initialize_access_control`
 * first is idempotent and is what makes every guarded read and write succeed.
 * The real Internet Identity flow already registers its caller during
 * `_internet_identity_sign_in_finish`, so it is left untouched.
 */
export function useUserRole() {
  const { actor, isFetching } = useActor(actorFactory);
  const { isAuthenticated } = useInternetIdentity();
  const testSignIn = isTestSignInActive();

  const query = useQuery<UserRole>({
    queryKey: ["callerUserRole"],
    queryFn: async () => {
      if (!actor) return UserRole.guest;
      await ensureTestPrincipalRegistered(actor);
      return actor.getCallerUserRole();
    },
    enabled: !!actor && !isFetching && (isAuthenticated || testSignIn),
    retry: false,
  });

  const role = query.data ?? UserRole.guest;
  return {
    role,
    isAdmin: role === UserRole.admin,
    isLoading:
      (isAuthenticated || testSignIn) && (isFetching || query.isLoading),
  };
}
