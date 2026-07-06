# Project Hoiku Design System v1.0

## Purpose

Project Hoiku のUIを一貫させるためのデザインシステム。

このドキュメントは、色・余白・角丸・影・文字・アイコン・コンポーネントの基準を定義する。

新しい画面やUIを作る場合は、必ずこのDesign Systemに従う。

---

## Concept

Appleの整理されたUI  
×  
北欧キッズブランドのやさしい世界観

Project Hoikuは子ども向けアプリではなく、忙しい保護者のためのアプリ。

かわいさは過剰な装飾ではなく、以下で表現する。

- 配色
- 余白
- 丸み
- やわらかい影
- 整理された情報構造

---

## Color Tokens

### Base

| Token | Value | Usage |
|---|---:|---|
| `background` | `#FFFBF2` | アプリ全体の背景 |
| `surface` | `#FFFFFF` | 白いカード、ステータスカード、入力エリア |
| `border-soft` | `#EFE7DC` | カード境界線、やわらかい枠線 |
| `divider` | `#EEE9E2` | 区切り線 |

### Cards

| Token | Value | Usage |
|---|---:|---|
| `card-items` | `#EAF6FF` | 持ち物カード |
| `card-today` | `#FFF0F4` | 今日だけ追加カード |
| `card-stock` | `#F2F8EE` | ざっくり管理カード |

### Brand / Action

| Token | Value | Usage |
|---|---:|---|
| `primary` | `#F8A28D` | メインボタン、確認完了 |
| `primary-hover` | `#F58F7A` | メインボタンのhover / active |
| `danger` | `#F06F8B` | 削除・注意が必要な操作 |
| `warning` | `#E7B95A` | 警告・未完了 |
| `success` | `#82B96D` | 完了・成功 |

### Icons

| Token | Value | Usage |
|---|---:|---|
| `icon-items` | `#2F86C9` | 持ち物系アイコン |
| `icon-today` | `#F06F8B` | 今日だけ追加系アイコン |
| `icon-stock` | `#82B96D` | ざっくり管理系アイコン |

### Text

| Token | Value | Usage |
|---|---:|---|
| `text-primary` | `#2F2F2F` | 見出し、主要テキスト |
| `text-secondary` | `#707070` | 補足テキスト |
| `text-tertiary` | `#A6A6A6` | キャプション、非アクティブ |

### Tabs

| Token | Value | Usage |
|---|---:|---|
| `tab-active` | `#FFF0F4` | アクティブタブ背景 |
| `tab-inactive` | `#8A8A8A` | 非アクティブタブ文字・アイコン |

---

## Layout Tokens

### Spacing

使用できる余白は以下のみ。

| Token | Value |
|---|---:|
| `space-1` | `4px` |
| `space-2` | `8px` |
| `space-4` | `16px` |
| `space-6` | `24px` |
| `space-8` | `32px` |
| `space-12` | `48px` |
| `space-16` | `64px` |

### Spacing Rules

- 8pxグリッドを基本にする
- カード外の余白は原則 `24px`
- カード内の余白は原則 `24px`
- 小さな要素間は `8px` または `16px`
- セクション間は `24px` または `32px`
- 画面全体に詰め込みすぎない
- 迷ったら余白を増やす

---

## Radius Tokens

| Token | Value | Usage |
|---|---:|---|
| `radius-card` | `28px` | メインカード |
| `radius-section` | `24px` | セクションカード |
| `radius-button` | `999px` | ボタン |
| `radius-input` | `18px` | 入力欄 |
| `radius-tab` | `22px` | タブ |
| `radius-avatar` | `999px` | アバター |

### Radius Rules

- 角丸は大きめにする
- 小さすぎる角丸は禁止
- Sharp / Material Design風の角丸は禁止
- 丸みでやさしさを出す

---

## Shadow Tokens

| Token | Value | Usage |
|---|---|---|
| `shadow-card` | `0 8px 24px rgba(0,0,0,.05)` | カード |
| `shadow-floating` | `0 12px 32px rgba(0,0,0,.07)` | BottomSheetなど浮遊要素 |
| `shadow-button` | `0 6px 16px rgba(248,162,141,.22)` | PrimaryButton |

### Shadow Rules

- 影は弱く、自然にする
- 強いドロップシャドウは禁止
- 立体感よりも清潔感を優先する

---

## Typography

### Font

| Token | Value |
|---|---|
| `font-family` | `Noto Sans JP` |

### Font Weight

| Token | Value | Usage |
|---|---:|---|
| `heading` | `700` | 画面見出し |
| `card-title` | `700` | カードタイトル |
| `button` | `600` | ボタン |
| `item` | `600` | リスト項目 |
| `body` | `500` | 通常本文 |
| `caption` | `400` | キャプション |

### Font Size

| Token | Value | Usage |
|---|---:|---|
| `app-title` | `32px` | アプリタイトル |
| `child-name` | `36px` | 子どもの名前 |
| `card-title` | `24px` | カードタイトル |
| `button` | `18px` | ボタン |
| `list-item` | `18px` | リスト項目 |
| `number` | `16px` | 数字 |
| `status` | `14px` | ステータス |
| `caption` | `12px` | 補足 |

### Line Height

| Token | Value |
|---|---:|
| `heading-line-height` | `120%` |
| `body-line-height` | `150%` |

### Typography Rules

- 見出しは太く、本文は読みやすく
- 数字は `tabular-nums` を使う
- 文字サイズを無闇に増やさない
- 1画面の中で文字の階層を増やしすぎない

---

## Icon System

### Profile Avatar

Project Hoiku専用イラストを使用する。

#### Common

- 赤ちゃん寄り
- フラット
- 塗りあり
- ブラウン線
- ほっぺあり
- 丸顔
- 子どもっぽすぎず、保護者向けUIに馴染むこと

#### Boy

- 前髪あり
- 丸い顔
- 赤ちゃんらしい表情

#### Girl

- おさげ
- 男の子と同じ顔
- 髪型のみで女の子らしさを出す

### UI Icons

| Rule | Value |
|---|---|
| Icon Library | `lucide-react` |
| Stroke Width | `2px` |
| Fill | なし |
| Background | 丸背景あり |

### Icon Rules

- アイコン単体で主張させすぎない
- 色は用途別のIcon Tokenを使う
- 新しいアイコン色を追加しない
- 塗りアイコンは禁止
- Material Icons風にしない

---

## Components

新しい画面は、必ず以下の共通コンポーネントを組み合わせて作る。

### Required Components

- `Header`
- `SectionCard`
- `ItemRow`
- `ProgressDots`
- `PrimaryButton`
- `SecondaryButton`
- `BottomTab`
- `Input`
- `BottomSheet`
- `Avatar`

### Component Rules

- 画面ごとの独自UIは禁止
- 既存コンポーネントで表現できない場合は、先にコンポーネントを拡張する
- 新しいコンポーネントを作る場合も、このDesign Systemに従う
- 1画面だけの例外デザインを作らない

---

## Header

### Structure

Headerは以下の順番で構成する。

1. プロフィールアイコン
2. 子どもの名前
3. 白いステータスカード

### Rules

- Headerは全画面で一貫させる
- 子どもの名前を主役にする
- ステータス情報は白いカードにまとめる
- 情報を増やしすぎない

---

## Screen Structure

### Tabs

タブは3つのみ。

- 確認
- 準備
- 設定

### Rules

- ホーム画面は作らない
- タブを増やさない
- タブ名称を勝手に変更しない
- 画面構成は「確認 → 準備 → 設定」を基準にする

---

## Current UI Direction

現在のUI方向性は以下を採用済み。

| Area | Direction |
|---|---|
| 背景 | クリームホワイト |
| 持ち物 | 淡い水色 |
| 今日だけ追加 | 淡いピンク |
| ざっくり管理 | 淡いセージ |
| 確認完了 | やさしいコーラルピーチ |

---

## Do / Don't

### Do

- Design Tokensを使う
- 余白を広く取る
- カードで情報を整理する
- 色に役割を持たせる
- 保護者が迷わない導線にする
- 片手で操作しやすくする
- 毎日使っても疲れない画面にする

### Don't

- 新しい色を追加しない
- タブを増やさない
- ホーム画面を作らない
- Material Design風にしない
- 角丸を小さくしない
- 影を強くしない
- 情報を詰め込みすぎない
- 子ども向けアプリのように装飾しすぎない
- 画面ごとの独自UIを作らない

---

## Implementation Priority

Design System導入時の優先順位。

1. Design TokensをTailwindへ反映する
2. 共通コンポーネントを作成する
3. 既存UIを共通コンポーネントへ置き換える
4. 画面ごとの独自スタイルを削除する
5. 新機能追加はDesign System統一後に行う

---

## Version

- Version: `1.0`
- Project: `Project Hoiku`
- Purpose: 保育園準備を30秒で終わらせるための親向けアプリ
