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

PROF_ACC = Hash.new { |h, k| h[k] = [0, 0.0] }
def __install_prof
  targets = %w(Scene_Map Game_Map Game_Player Game_Event Game_Character Game_Interpreter Spriteset_Map Sprite_Character
               Window_Message Window_Base Game_Screen Game_Picture Sprite_Picture Spriteset_Weather Game_Timer Sprite_Timer Game_Vehicle)
  targets.each do |n|
    next unless Object.const_defined?(n)
    c = Object.const_get(n)
    c.instance_methods(false).each do |m|
      next if m.to_s =~ /[=?!]\z/ || %i(initialize).include?(m)
      orig = c.instance_method(m)
      c.send(:define_method, m) do |*a, &b|
        m0 = $js.call(:wasmMemKB).to_i
        t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        r = orig.bind(self).call(*a, &b)
        k = "#{n}##{m}"
        acc = PROF_ACC[k]
        acc[0] += $js.call(:wasmMemKB).to_i - m0
        acc[1] += (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0) * 1000
        r
      end
    end
  end
end

scripts = load_data('Data/Scripts.rvdata')
loaded = 0
scripts.each_with_index do |entry, i|
  name = entry[1].to_s
  if SKIP_SCRIPTS.key?(name)
    $js.call(:log, "[boot] skip #{name}: #{SKIP_SCRIPTS[name]}")
    next
  end
  __install_prof if $PROF && name == 'Main'
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
