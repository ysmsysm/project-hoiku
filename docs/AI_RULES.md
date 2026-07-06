# Project Hoiku AI Rules

## Purpose

このドキュメントは、Project Hoiku を実装するAIが必ず守るルールを定義する。

Design System や Design Principles より優先して解釈を変更してはいけない。

AIは実装前に必ず

- docs/DESIGN_SYSTEM.md
- docs/DESIGN_PRINCIPLES.md
- docs/AI_RULES.md

を参照すること。

---

# First Priority

Project Hoiku の目的は

**保育園準備を30秒で。**

忙しい保護者が迷わず準備を終えられること。

実装時は機能追加よりも、

- 分かりやすさ
- 一貫性
- 操作速度

を優先する。

---

# UI Rules

AIは勝手にUIを変更しない。

禁止事項

- タブを増やす
- ホーム画面を作る
- ナビゲーションを変更する
- Material Design風に変更する
- iOS標準画面へ寄せすぎる
- 独自デザインを追加する

タブ構成は必ず

- 確認
- 準備
- 設定

の3つのみ。

---

# Design Rules

必ず Design System に従う。

禁止事項

- 新しい色を追加
- 新しい影を追加
- 新しい角丸を追加
- 新しい余白ルールを追加
- 新しいタイポグラフィを追加

Design Tokens を利用すること。

---

# Component Rules

画面ごとの独自UIは禁止。

必ず共通コンポーネントを利用する。

- Header
- SectionCard
- ItemRow
- ProgressDots
- PrimaryButton
- SecondaryButton
- BottomTab
- Input
- BottomSheet
- Avatar

新しいコンポーネントが必要な場合は、

既存コンポーネントを拡張する。

---

# Implementation Rules

実装は以下の優先順位で行う。

1. バグ修正
2. デザイン統一
3. コンポーネント共通化
4. リファクタリング
5. 新機能追加

新機能追加のために既存UIを崩してはいけない。

---

# Coding Rules

- TypeScript を使用する
- App Router を利用する
- Tailwind CSS を利用する
- コンポーネントを小さく保つ
- 重複コードを書かない
- 命名は分かりやすくする
- any 型は原則使用しない

---

# UX Rules

迷ったら、

「忙しい保護者ならどう感じるか」

で判断する。

以下を優先する。

- タップ回数を減らす
- 判断回数を減らす
- 入力を減らす
- 情報を減らす
- 毎日使いやすくする

---

# Before Implementing

実装前に必ず確認する。

- Design System に違反していないか
- 新しい色を追加していないか
- 新しいUIを作っていないか
- コンポーネントを再利用しているか
- 保護者ファーストになっているか

---

# After Implementing

実装後は必ず確認する。

- デザインが統一されているか
- 既存画面を壊していないか
- レスポンシブ表示が崩れていないか
- TypeScript エラーがないか
- ESLint エラーがないか

---

# Git Rules

作業終了時は必ず

git add .
git commit -m "変更内容"
git push

まで実施する。

コミット前に動作確認を行う。

---

# Never Do

AIは以下を勝手に行ってはいけない。

- UIを全面リニューアルする
- 色を変更する
- タブを増やす
- ホーム画面を追加する
- 新しいデザイン思想を導入する
- Material Design風に変更する
- Design Systemを無視する
- 画面ごとに別デザインを作る
- 指示されていない機能を追加する

---

# Summary

Project Hoiku の価値は、

「保育園準備を30秒で終わらせること」

にある。

AIは機能を増やすことよりも、

- 一貫性
- 分かりやすさ
- 保護者ファースト

を優先して実装する。
