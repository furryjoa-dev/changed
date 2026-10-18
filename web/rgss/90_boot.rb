# Data/Scripts.rvdata 를 순서대로 로드하고 게임(Main)을 실행한다.
Dir.chdir('/game') rescue nil

# 웹에서 동작하지 않는 스크립트: 이름 => 사유
SKIP_SCRIPTS = {
  'Screen' => 'Fullscreen++ (Win32 API) - 브라우저는 자체 전체화면 사용',
}

# 로드 직후 덮어써야 하는 부분 (Win32 메모리 접근 대체)
POST_SCRIPT = {
  'Save' => proc {
    class Bitmap
      def _dump(limit)
        [width, height, Zlib::Deflate.deflate(__raw)].pack('LLa*')
      end
      def self._load(str)
        w, h, z = str.unpack('LLa*')
        b = new(w, h)
        b.__raw = Zlib::Inflate.inflate(z)
        b
      end
    end
  },
}

def __report_error(e, where = nil)
  msg = "#{e.class}: #{e.message}"
  bt = (e.backtrace || []).first(12).join("\n")
  $js.call(:fatal, "#{where}\n#{msg}\n#{bt}")
end

scripts = load_data('Data/Scripts.rvdata')
loaded = 0
scripts.each_with_index do |entry, i|
  name = entry[1].to_s
  if SKIP_SCRIPTS.key?(name)
    $js.call(:log, "[boot] skip #{name}: #{SKIP_SCRIPTS[name]}")
    next
  end
  code = Zlib::Inflate.inflate(entry[2]).force_encoding(Encoding::UTF_8)
  begin
    eval(code, TOPLEVEL_BINDING, "Scripts/#{format('%03d', i)}_#{name}", 1)
    POST_SCRIPT[name].call if POST_SCRIPT[name]
    loaded += 1
  rescue SystemExit
    break
  rescue Exception => e
    __report_error(e, "script #{i} (#{name})")
    break
  end
end
$js.call(:log, "[boot] #{loaded} scripts finished")
$js.call(:gameEnded)
