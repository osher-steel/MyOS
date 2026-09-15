/**
 * Who is calling the API. Personal OS has exactly one human, so there is no
 * user document, no roles and no permission map — a request is either the
 * owner (Firebase ID token whose uid matches MYOS_OWNER_UID), a trusted
 * automation holding the `myos_` API key, or anonymous.
 */
export enum PrincipalKind {
  OWNER = "owner",
  API_KEY = "apiKey",
}

export type Principal = {
  id: string;
  kind: PrincipalKind;
  email?: string;
};
