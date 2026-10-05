# Intentgram — MVP Spec

### Purpose

An alternative Instagram interface that lets users **choose what they want to see**, instead of being driven by an algorithmic feed.

### Core use case

> “I only want to see wildlife content from the accounts I follow.”

### Input

* Connect personal Instagram account
* Start with recent content only

### Core Flow

```text
Instagram
    ↓
Recent posts
    ↓
AI classifies each post by topic
    ↓
Dashboard
    ↓
Choose a topic
    ↓
Latest / Curated
    ↓
Browse / Read
```

### Dashboard

AI automatically creates the main topics:

```text
Wildlife      32 new
Dance         18 new
Travel        12 new
Architecture   7 new
More →
```

User can:

* Rename / merge / delete categories
* Move content to another category

### Category

**Latest**

* Show relevant posts chronologically

**Curated**

* AI summarizes posts so users can quickly understand them
* AI does not decide what is “worth seeing”

### UI

**Browse**

* Compact cards
* Image/video preview
* Short AI summary

**Read**

* Full content view where possible
* Original caption
* Link/open original Instagram content

### MVP excludes

* Saved Items
* Search
* New-account recommendations
* Full native Reel experience
* Full historical indexing
* Social features

### Product principle

> **AI organizes. You choose.**

> **Intentgram — Browse Instagram with intent.**
