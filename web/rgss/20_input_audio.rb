module Input
  DOWN = 2; LEFT = 4; RIGHT = 6; UP = 8
  A = 11; B = 12; C = 13; X = 14; Y = 15; Z = 16; L = 17; R = 18
  SHIFT = 21; CTRL = 22; ALT = 23
  F5 = 25; F6 = 26; F7 = 27; F8 = 28; F9 = 29
  KEYS = [2, 4, 6, 8, 11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 25, 26, 27, 28, 29]
  @count = Hash.new(0)
  @last_dir = 0
  class << self
    def update
      mask = $js.call(:keyMask).to_i
      KEYS.each do |k|
        if (mask >> k) & 1 == 1
          @count[k] += 1
          @last_dir = k if @count[k] == 1 && k <= 8
        else
          @count[k] = 0
        end
      end
    end
    def press?(k); @count[k] > 0; end
    def trigger?(k); @count[k] == 1; end
    def repeat?(k)
      c = @count[k]
      c == 1 || (c >= 24 && (c - 24) % 6 == 0)
    end
    def dir4
      return @last_dir if @last_dir > 0 && @count[@last_dir] > 0
      [2, 4, 6, 8].each { |k| return k if @count[k] > 0 }
      0
    end
    def dir8
      dx = (@count[RIGHT] > 0 ? 1 : 0) - (@count[LEFT] > 0 ? 1 : 0)
      dy = (@count[DOWN] > 0 ? 1 : 0) - (@count[UP] > 0 ? 1 : 0)
      code = 5 + dx - 3 * dy
      code == 5 ? 0 : code
    end
  end
end

module Audio
  class << self
    def bgm_play(name, volume = 100, pitch = 100, pos = 0); $js.call(:audioPlay, 'bgm', name.to_s, volume, pitch); end
    def bgm_stop; $js.call(:audioStop, 'bgm'); end
    def bgm_fade(time); $js.call(:audioFade, 'bgm', time); end
    def bgs_play(name, volume = 100, pitch = 100, pos = 0); $js.call(:audioPlay, 'bgs', name.to_s, volume, pitch); end
    def bgs_stop; $js.call(:audioStop, 'bgs'); end
    def bgs_fade(time); $js.call(:audioFade, 'bgs', time); end
    def me_play(name, volume = 100, pitch = 100); $js.call(:audioPlay, 'me', name.to_s, volume, pitch); end
    def me_stop; $js.call(:audioStop, 'me'); end
    def me_fade(time); $js.call(:audioFade, 'me', time); end
    def se_play(name, volume = 100, pitch = 100); $js.call(:audioPlay, 'se', name.to_s, volume, pitch); end
    def se_stop; $js.call(:audioStop, 'se'); end
  end
end
