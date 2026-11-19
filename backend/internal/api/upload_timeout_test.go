package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// The server's ReadTimeout covers the whole request including the body, so a big upload over a slow
// connection used to be cut off half way (the model upload then failed with "Send the files as a form").
// allowSlowUpload gives an upload route its own, longer deadline.
func TestAllowSlowUploadOutlastsReadTimeout(t *testing.T) {
	read := func(slow bool) error {
		srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if slow {
				allowSlowUpload(w)
			}
			if _, err := io.Copy(io.Discard, r.Body); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		}))
		srv.Config.ReadTimeout = 150 * time.Millisecond
		srv.Start()
		defer srv.Close()

		pr, pw := io.Pipe()
		go func() {
			for i := 0; i < 4; i++ {
				time.Sleep(120 * time.Millisecond) // about 480 ms in all, over the 150 ms ReadTimeout
				pw.Write([]byte(strings.Repeat("x", 1000)))
			}
			pw.Close()
		}()
		req, _ := http.NewRequest("PUT", srv.URL, pr)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			return err // the connection was closed by the timeout
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			return io.EOF
		}
		return nil
	}
	if read(false) == nil {
		t.Fatal("test set-up: the slow upload should be cut off by the ReadTimeout without allowSlowUpload")
	}
	if err := read(true); err != nil {
		t.Fatalf("with allowSlowUpload the upload should get through: %v", err)
	}
}
