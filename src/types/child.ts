export type ChildIconId = "default-baby";
export type ChildIconType = "default" | "image";

export type ChildProfile = {
  name: string;
  iconType: ChildIconType;
  iconId: ChildIconId;
  iconUrl: string | null;
  birthday: string | null;
  photoUrl: string | null;
};
