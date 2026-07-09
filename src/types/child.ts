export type ChildIconId = "default-baby";

export type ChildProfile = {
  name: string;
  iconId: ChildIconId;
  birthday: string | null;
  photoUrl: string | null;
};
