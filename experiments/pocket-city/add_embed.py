#!/usr/bin/env python3
"""Give the built Pocket City pages an in-app look (AboveGround addition, run after build.py and add_weather.py).

    python3 experiments/pocket-city/add_embed.py frontend/public/pocket/*.html

Opened with ?embed=1 (the app's Street view does this), a page drops its own header and paper, and the block sits like
a model on a dark table under a soft light, with the season and weather controls in the app's matte panels. Without the
parameter the page looks exactly as the kit drew it.

Either way the page tells its parent window when the first frame is on screen:
    {type: "pocket-city:ready", angle}   angle = where north points on screen, in degrees clockwise from up
so the app can hold its fade until the diorama is ready and turn the map to the same heading. Pages that already have
the patch are skipped. Standard library only.
"""
import sys
from pathlib import Path

MARK = "AboveGround embed (add_embed.py)"

HEAD_JS = ("<script>/* " + MARK + " */if(/[?&]embed=1(&|$)/.test(location.search))"
           "document.documentElement.classList.add('embed')</script></head>")

CSS = """
/* AboveGround embed (add_embed.py): the in-app look, only under ?embed=1 */
html.embed{--paper:#0b0c0f;--panel:rgba(9,9,11,.88);--ink:#f4f4f5;--muted:#a1a1aa;--rule:rgba(255,255,255,.12);--rust:#fca5a5;--green:#fafafa}
html.embed body{background:#0b0c0f;color:#f4f4f5}
html.embed .top{display:none}
html.embed .workspace{height:calc(100% - 33px);background:radial-gradient(ellipse 58% 52% at calc(50% + 140px) 52%,#2a2d34 0%,#17191e 48%,#0b0c0f 100%)}
html.embed .workspace:after{display:none}
html.embed .paper,html.embed .tools,html.embed .views{background:rgba(9,9,11,.88);border:1px solid rgba(255,255,255,.12);box-shadow:none;-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}
html.embed .info>*:not(.season-box){display:none}
html.embed .info{padding:14px 14px 12px}
html.embed .season-box{border-top:0;margin-top:0;padding-top:0}
html.embed .subhead,html.embed .key-toggle{color:#a1a1aa;font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase}
html.embed .chip{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:#e4e4e7}
html.embed .chip:hover{background:rgba(255,255,255,.1)}
html.embed .chip[aria-pressed=true]{background:#fafafa;border-color:#fafafa;color:#09090b}
html.embed .select-wrap{border:1px solid rgba(255,255,255,.12);border-style:solid;color:#e4e4e7}
html.embed .select-wrap select{color:#e4e4e7}
html.embed .select-wrap option{color:#111;background:#fff}
html.embed .events .on{background:rgba(255,255,255,.12);border-style:solid}
html.embed .note{color:#d4d4d8}
html.embed .note a,html.embed .foot,html.embed .foot a,html.embed .scale,html.embed .gesture,html.embed .zoom-value,html.embed .loading{color:#a1a1aa}
html.embed .row{color:#e4e4e7}
html.embed .row:hover{background:rgba(255,255,255,.06)}
html.embed .row small{color:#a1a1aa}
html.embed .tool{color:#e4e4e7}
html.embed .tool:hover{background:rgba(255,255,255,.08)}
html.embed .tool[aria-pressed=true]{background:rgba(255,255,255,.14)}
html.embed .play{background:#fafafa;color:#09090b}
html.embed .play:hover{background:#e4e4e7}
html.embed .divider{background:rgba(255,255,255,.12)}
html.embed .vbtn{color:#d4d4d8}
html.embed .vbtn[aria-pressed=true]{background:#fafafa;color:#09090b}
html.embed .foot{background:transparent;border-top:1px solid rgba(255,255,255,.08)}
html.embed .compass circle:first-child{fill:#17191e;fill-opacity:.85}
html.embed .mark{display:none}
html.embed #wxNote,html.embed #note{font-size:12.5px}
html.embed .embed-notes{font:9px var(--mono);letter-spacing:.015em;color:#a1a1aa;text-decoration:underline;margin-right:auto;padding:0}
@media(max-width:760px){html.embed .workspace{height:calc(100% - 24px)}}
"""

READY_OLD = "shown=frame.seq;"
READY_NEW = ("shown=frame.seq;if(!self.__pcReady){self.__pcReady=1;"
             "try{parent.postMessage({type:'pocket-city:ready',angle:frame.angle},'*')}catch(e){}}")

# Field notes live in the header, which embed mode hides: give them a link in the footer.
MAIN_OLD = "selectSeason(season);setPlay(playing);requestAnimationFrame(tick);"
MAIN_NEW = ("if(document.documentElement.classList.contains('embed')){const b=document.createElement('button');"
            "b.type='button';b.className='embed-notes';b.textContent='Field notes';b.onclick=()=>$('notes').showModal();"
            "document.querySelector('.foot').prepend(b)}\n" + MAIN_OLD)


def patch(path: Path) -> str:
    s = path.read_text(encoding="utf-8")
    if MARK in s:
        return "already patched"
    for old, new in [("</head>", HEAD_JS), (READY_OLD, READY_NEW), (MAIN_OLD, MAIN_NEW)]:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f"{path}: expected one '{old[:50]}', found {n} (was the page built by a different kit version?)")
        s = s.replace(old, new)
    s = s.replace("</style>", CSS + "</style>", 1)
    path.write_text(s, encoding="utf-8")
    return "patched"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    for arg in sys.argv[1:]:
        p = Path(arg)
        if p.name == "index.html":
            continue
        print(f"{p.name}: {patch(p)}")
