import time

from app.services.rag import embedder


def test_embedding_preheat_runs_in_background(monkeypatch):
    finished = []

    def slow_preheat():
        time.sleep(0.2)
        finished.append(True)

    monkeypatch.setattr(embedder, "preheat", slow_preheat)
    started = time.perf_counter()
    embedder.start_preheat()
    elapsed = time.perf_counter() - started

    assert elapsed < 0.1
    for _ in range(50):
        if finished:
            break
        time.sleep(0.01)
    assert finished == [True]
