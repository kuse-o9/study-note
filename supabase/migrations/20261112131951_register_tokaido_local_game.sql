insert into study_private.game_publication(id,title,path,published) values ('tokaido-local','東海道線 東京〜熱海（簡易運転版）','rail-games/tokaido/index.html',true) on conflict(id) do nothing;
